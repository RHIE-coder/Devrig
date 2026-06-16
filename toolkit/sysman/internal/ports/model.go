// Package ports implements the Ports view — the primary view of sysman. It
// lists TCP listeners (the things that cause "address already in use" errors),
// mapping each port to its owning process and, crucially, to the *project* it
// was started from (derived from the process working directory). This is aimed
// at finding and killing orphaned servers — e.g. ones an AI agent spawned
// detached from any terminal — that are silently holding a port.
package ports

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	pnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/timefmt"
)

// refreshInterval controls how often listeners are re-scanned.
const refreshInterval = 3 * time.Second

// projectMarkers are files/dirs that mark the root of a project. The first one
// found while walking up from a process's working directory names the project.
var projectMarkers = []string{
	".git", "go.mod", "go.work", "package.json",
	"Cargo.toml", "pyproject.toml", "pom.xml", "build.gradle",
}

// Listener is one TCP listening socket and the process/project behind it.
type Listener struct {
	Port      uint32    `json:"port"`
	Addr      string    `json:"addr"`
	PID       int32     `json:"pid"`
	PPID      int32     `json:"ppid"` // parent PID; PPID 1 means the launching terminal is gone (orphan)
	Process   string    `json:"process"`
	Project   string    `json:"project"`
	Cwd       string    `json:"cwd"`
	Cmdline   string    `json:"cmdline"` // full command line the listener was launched with
	CPU       float64   `json:"cpu"`
	Mem       float32   `json:"mem"`
	Started   time.Time `json:"started"`     // process start time (zero if unknown)
	UptimeSec int64     `json:"uptime_sec"`  // how long the process has been running
}

type (
	listenersMsg []Listener
	errMsg       struct{ err error }
	tickMsg      time.Time
)

// Model is the Ports view. Like the other views it is a sub-model whose Update
// returns the concrete type so the parent can embed it by value.
type Model struct {
	table     table.Model
	all       []Listener // every listener
	shown     []Listener // listeners after the filter is applied (matches table rows)
	err       error
	width       int
	procW       int
	projW       int
	filter      string
	filtering   bool
	showStarted bool // AGE column shows absolute start time instead of elapsed age
}

// New builds the Ports view.
func New() Model {
	t := table.New(table.WithFocused(true))

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderBottom(true).
		Bold(true)
	s.Selected = s.Selected.
		Foreground(lipgloss.Color("231")).
		Background(lipgloss.Color("57")).
		Bold(true)
	t.SetStyles(s)

	m := Model{table: t, procW: 18, projW: 22}
	m.applyColumns()
	return m
}

// Init loads listeners once and starts the refresh ticker.
func (m Model) Init() tea.Cmd {
	return tea.Batch(loadListeners, tick())
}

// Filtering reports whether the view is currently capturing filter keystrokes,
// so the parent knows not to treat keys as global shortcuts.
func (m Model) Filtering() bool { return m.filtering }

// Focused returns the selected listener (or nil), for state export.
func (m Model) Focused() any {
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return nil
	}
	return m.shown[i]
}

// Filter returns the active filter query (empty if none), for state export.
func (m Model) Filter() string { return m.filter }

// Visible returns the rows currently listed (after filtering), capped so the
// state file stays small, for state export.
func (m Model) Visible() any {
	const limit = 100
	if len(m.shown) > limit {
		return m.shown[:limit]
	}
	return m.shown
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case listenersMsg:
		m.err = nil
		m.all = []Listener(msg)
		m.applyFilter()
		return m, nil

	case errMsg:
		m.err = msg.err
		return m, nil

	case tickMsg:
		return m, tea.Batch(loadListeners, tick())

	case tea.KeyMsg:
		if m.filtering {
			return m.updateFilter(msg)
		}
		switch msg.String() {
		case "/":
			m.filtering = true
			return m, nil
		case "r":
			return m, loadListeners
		case "k":
			return m, m.killSelected(false)
		case "K", "x":
			return m, m.killSelected(true)
		}
	}

	var cmd tea.Cmd
	m.table, cmd = m.table.Update(msg)
	return m, cmd
}

func (m Model) updateFilter(msg tea.KeyMsg) (Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.filtering = false
		m.filter = ""
		m.applyFilter()
	case "enter":
		m.filtering = false // keep the filter applied, leave input mode
	case "backspace":
		if len(m.filter) > 0 {
			m.filter = m.filter[:len(m.filter)-1]
			m.applyFilter()
		}
	default:
		if len(msg.Runes) > 0 {
			m.filter += string(msg.Runes)
			m.applyFilter()
		}
	}
	return m, nil
}

func (m Model) View() string {
	var status string
	switch {
	case m.err != nil:
		status = errStyle.Render("error: " + m.err.Error())
	case m.filtering || m.filter != "":
		cursor := ""
		if m.filtering {
			cursor = "_"
		}
		status = filterStyle.Render(fmt.Sprintf("필터 /%s%s  (%d/%d)  [esc 해제]", m.filter, cursor, len(m.shown), len(m.all)))
	default:
		status = m.detail()
	}
	return m.table.View() + "\n" + status
}

// SetSize fits the table to the available area and reflows the flexible columns
// (PROCESS, PROJECT) to use the extra width. One row is reserved for the
// status/detail line.
func (m *Model) SetSize(w, h int) {
	m.width = w

	const fixed = colPort + colPID + colAge + colCPU + colMem
	const gutters = 14 // padding the table inserts between/around the columns
	rest := w - fixed - gutters
	if rest < 24 {
		rest = 24
	}
	m.procW = rest * 2 / 5
	m.projW = rest - m.procW
	if m.procW < 8 {
		m.procW = 8
	}
	if m.projW < 8 {
		m.projW = 8
	}
	m.applyColumns()

	if h < 2 {
		h = 2
	}
	m.table.SetWidth(w)
	m.table.SetHeight(h - 1)
	m.setRows()
}

const (
	colPort = 6
	colPID  = 7
	colAge  = 16 // fits both "365d 23h 59m 59s" and "2006-01-02 15:04"
	colCPU  = 6
	colMem  = 6
)

func (m *Model) applyColumns() {
	ageTitle := "AGE"
	if m.showStarted {
		ageTitle = "STARTED"
	}
	m.table.SetColumns([]table.Column{
		{Title: "PORT", Width: colPort},
		{Title: "PID", Width: colPID},
		{Title: "PROCESS", Width: m.procW},
		{Title: "PROJECT", Width: m.projW},
		{Title: ageTitle, Width: colAge},
		{Title: "CPU%", Width: colCPU},
		{Title: "MEM%", Width: colMem},
	})
}

// SetTimeMode switches the AGE column between elapsed age and absolute start
// time, and re-renders.
func (m *Model) SetTimeMode(showStarted bool) {
	m.showStarted = showStarted
	m.applyColumns()
	m.setRows()
}

// timeCell renders the AGE/STARTED column value for the current mode.
func (m Model) timeCell(start time.Time) string {
	if m.showStarted {
		return timefmt.Started(start)
	}
	return timefmt.Age(start)
}

func (m *Model) applyFilter() {
	m.shown = filterListeners(m.all, m.filter)
	m.setRows()
}

func filterListeners(items []Listener, q string) []Listener {
	if q == "" {
		return items
	}
	q = strings.ToLower(q)
	out := make([]Listener, 0, len(items))
	for _, it := range items {
		hay := strings.ToLower(fmt.Sprintf("%d %s %s", it.Port, it.Process, it.Project))
		if strings.Contains(hay, q) {
			out = append(out, it)
		}
	}
	return out
}

// detail shows the selected listener's full address + working directory, which
// is too long to fit in the PROJECT column. The path is shortened (~) and, if
// still too wide, head-truncated so the project-bearing tail stays visible.
func (m Model) detail() string {
	if len(m.shown) == 0 {
		return detailStyle.Render("(리스닝 중인 포트 없음)")
	}
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return ""
	}
	it := m.shown[i]
	when := ""
	if !it.Started.IsZero() {
		when = fmt.Sprintf("up %s (%s)  ", timefmt.Full(time.Since(it.Started)), it.Started.Format("2006-01-02 15:04"))
	}
	prefix := fmt.Sprintf("▸ %s:%d  pid %d  %s", it.Addr, it.Port, it.PID, when)
	cwd := shortenPath(it.Cwd)
	if cwd == "" {
		cwd = "—"
	}
	if avail := m.width - len(prefix); avail > 1 && len(cwd) > avail {
		cwd = "…" + cwd[len(cwd)-(avail-1):]
	}
	return detailStyle.Render(prefix + cwd)
}

func (m *Model) setRows() {
	rows := make([]table.Row, len(m.shown))
	for i, it := range m.shown {
		rows[i] = table.Row{
			strconv.Itoa(int(it.Port)),
			strconv.Itoa(int(it.PID)),
			truncate(it.Process, m.procW),
			truncate(it.Project, m.projW),
			m.timeCell(it.Started),
			fmt.Sprintf("%.1f", it.CPU),
			fmt.Sprintf("%.1f", it.Mem),
		}
	}
	m.table.SetRows(rows)
}

// killSelected terminates (or force-kills) the process owning the selected
// port, then reloads. Force-kill helps with detached servers that ignore
// SIGTERM.
func (m Model) killSelected(force bool) tea.Cmd {
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return nil
	}
	pid := m.shown[i].PID
	return func() tea.Msg {
		p, err := process.NewProcess(pid)
		if err != nil {
			return errMsg{err}
		}
		if force {
			err = p.Kill()
		} else {
			err = p.Terminate()
		}
		if err != nil {
			return errMsg{err}
		}
		return loadListeners()
	}
}

// Gather scans TCP listeners and resolves each to its process/project. It is
// shared by the TUI and the `--json ports` headless mode.
func Gather() ([]Listener, error) {
	conns, err := pnet.Connections("inet")
	if err != nil {
		return nil, err
	}

	type key struct {
		port uint32
		pid  int32
	}
	seen := map[key]bool{}
	procCache := map[int32]Listener{}
	items := make([]Listener, 0, len(conns))

	for _, c := range conns {
		if c.Status != "LISTEN" {
			continue
		}
		k := key{c.Laddr.Port, c.Pid}
		if seen[k] {
			continue
		}
		seen[k] = true

		info, ok := procCache[c.Pid]
		if !ok {
			info = gatherProc(c.Pid)
			procCache[c.Pid] = info
		}

		items = append(items, Listener{
			Port:      c.Laddr.Port,
			Addr:      c.Laddr.IP,
			PID:       c.Pid,
			PPID:      info.PPID,
			Process:   info.Process,
			Project:   info.Project,
			Cwd:       info.Cwd,
			Cmdline:   info.Cmdline,
			CPU:       info.CPU,
			Mem:       info.Mem,
			Started:   info.Started,
			UptimeSec: info.UptimeSec,
		})
	}

	sort.Slice(items, func(i, j int) bool { return items[i].Port < items[j].Port })
	return items, nil
}

func loadListeners() tea.Msg {
	items, err := Gather()
	if err != nil {
		return errMsg{err}
	}
	return listenersMsg(items)
}

// gatherProc collects the per-process fields shared across that process's ports.
func gatherProc(pid int32) Listener {
	l := Listener{PID: pid, Process: "—", Project: "—"}
	if pid <= 0 {
		return l
	}
	p, err := process.NewProcess(pid)
	if err != nil {
		l.Process = "?"
		return l
	}
	if name, err := p.Name(); err == nil {
		l.Process = name
	}
	l.PPID, _ = p.Ppid()
	l.Cmdline, _ = p.Cmdline()
	l.Cwd, _ = p.Cwd()
	l.CPU, _ = p.CPUPercent()
	l.Mem, _ = p.MemoryPercent()
	l.Project = projectName(l.Cwd)
	if ct, err := p.CreateTime(); err == nil && ct > 0 {
		l.Started = time.UnixMilli(ct)
		l.UptimeSec = int64(time.Since(l.Started).Seconds())
	}
	return l
}

// projectName walks up from cwd to the nearest directory containing a project
// marker and returns its base name. Falls back to the cwd's base name, or "—"
// for system processes whose cwd is "/" (or unknown).
func projectName(cwd string) string {
	if cwd == "" || cwd == "/" {
		return "—"
	}
	for dir := cwd; ; {
		for _, marker := range projectMarkers {
			if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
				return filepath.Base(dir)
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return filepath.Base(cwd)
		}
		dir = parent
	}
}

func shortenPath(p string) string {
	if home, err := os.UserHomeDir(); err == nil && home != "" && strings.HasPrefix(p, home) {
		return "~" + p[len(home):]
	}
	return p
}

func truncate(s string, n int) string {
	if n <= 0 {
		return ""
	}
	if len(s) <= n {
		return s
	}
	if n == 1 {
		return "…"
	}
	return s[:n-1] + "…"
}

func tick() tea.Cmd {
	return tea.Tick(refreshInterval, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

var (
	errStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196")).
			Bold(true)

	detailStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	filterStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("214")).
			Bold(true)
)
