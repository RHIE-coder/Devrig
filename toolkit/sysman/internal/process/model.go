// Package process implements the Processes view: a live, sortable table of all
// running processes with the ability to terminate the selected one.
package process

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/shirou/gopsutil/v4/process"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/timefmt"
)

// refreshInterval controls how often the process list is reloaded.
const refreshInterval = 2 * time.Second

// Process is a single snapshot of a process. Shared by the TUI and the
// `--json ps` headless mode.
type Process struct {
	PID       int32     `json:"pid"`
	PPID      int32     `json:"ppid"`    // parent PID (0 if unknown); follow upward for the ancestry chain
	Name      string    `json:"name"`
	User      string    `json:"user"`
	Status    string    `json:"status"`
	CPU       float64   `json:"cpu"`
	Mem       float32   `json:"mem"`
	Cmdline   string    `json:"cmdline"`    // full command line the process was launched with (how it was started)
	Started   time.Time `json:"started"`    // process start time (zero if unknown)
	UptimeSec int64     `json:"uptime_sec"` // how long the process has been running
}

type (
	processesMsg []Process
	errMsg       struct{ err error }
	tickMsg      time.Time
)

// Model is the Processes view (a sub-model embedded by the parent).
type Model struct {
	table     table.Model
	all         []Process
	shown       []Process
	err         error
	nameW       int
	filter      string
	filtering   bool
	showStarted bool // AGE column shows absolute start time instead of elapsed age
}

const (
	colPID  = 7
	colUser = 14
	colStat = 6
	colAge  = 16 // fits both "365d 23h 59m 59s" and "2006-01-02 15:04"
	colCPU  = 6
	colMem  = 6
)

// New builds the Processes view.
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

	m := Model{table: t, nameW: 26}
	m.applyColumns()
	return m
}

// Init loads the process list and starts the refresh ticker.
func (m Model) Init() tea.Cmd {
	return tea.Batch(loadProcesses, tick())
}

// Filtering reports whether the view is capturing filter keystrokes.
func (m Model) Filtering() bool { return m.filtering }

// Focused returns the selected process (or nil), for state export.
func (m Model) Focused() any {
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return nil
	}
	return m.shown[i]
}

// Filter returns the active filter query (empty if none), for state export.
func (m Model) Filter() string { return m.filter }

// FocusedPID returns the PID of the selected row (0 if none), so the parent can
// build that process's ancestry overlay.
func (m Model) FocusedPID() int32 {
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return 0
	}
	return m.shown[i].PID
}

// FocusedDetail returns the selected process's parent and launch command for the
// footer detail line. ok is false when nothing is selected.
func (m Model) FocusedDetail() (ppid int32, name, cmdline string, ok bool) {
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return 0, "", "", false
	}
	p := m.shown[i]
	return p.PPID, p.Name, p.Cmdline, true
}

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
	case processesMsg:
		m.err = nil
		m.all = []Process(msg)
		m.applyFilter()
		return m, nil

	case errMsg:
		m.err = msg.err
		return m, nil

	case tickMsg:
		return m, tea.Batch(loadProcesses, tick())

	case tea.KeyMsg:
		if m.filtering {
			return m.updateFilter(msg)
		}
		switch msg.String() {
		case "/":
			m.filtering = true
			return m, nil
		case "r":
			return m, loadProcesses
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
		m.filtering = false
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
		status = ""
	}
	return m.table.View() + "\n" + status
}

// SetSize fits the table and reflows the flexible NAME column. One row is
// reserved for the filter status line.
func (m *Model) SetSize(w, h int) {
	const fixed = colPID + colUser + colStat + colAge + colCPU + colMem
	const gutters = 14
	name := w - fixed - gutters
	if name < 12 {
		name = 12
	}
	m.nameW = name
	m.applyColumns()

	if h < 2 {
		h = 2
	}
	m.table.SetWidth(w)
	m.table.SetHeight(h - 1)
	m.setRows()
}

func (m *Model) applyColumns() {
	ageTitle := "AGE"
	if m.showStarted {
		ageTitle = "STARTED"
	}
	m.table.SetColumns([]table.Column{
		{Title: "PID", Width: colPID},
		{Title: "NAME", Width: m.nameW},
		{Title: "USER", Width: colUser},
		{Title: "STAT", Width: colStat},
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
	m.shown = filterProcesses(m.all, m.filter)
	m.setRows()
}

func filterProcesses(items []Process, q string) []Process {
	if q == "" {
		return items
	}
	q = strings.ToLower(q)
	out := make([]Process, 0, len(items))
	for _, p := range items {
		hay := strings.ToLower(fmt.Sprintf("%d %s %s", p.PID, p.Name, p.User))
		if strings.Contains(hay, q) {
			out = append(out, p)
		}
	}
	return out
}

func (m *Model) setRows() {
	rows := make([]table.Row, len(m.shown))
	for i, p := range m.shown {
		rows[i] = table.Row{
			strconv.Itoa(int(p.PID)),
			truncate(p.Name, m.nameW),
			truncate(p.User, colUser),
			p.Status,
			m.timeCell(p.Started),
			fmt.Sprintf("%.1f", p.CPU),
			fmt.Sprintf("%.1f", p.Mem),
		}
	}
	m.table.SetRows(rows)
}

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
		return loadProcesses()
	}
}

// Gather collects a snapshot of all processes, sorted by CPU descending. Shared
// by the TUI and the `--json ps` headless mode.
func Gather() ([]Process, error) {
	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}

	out := make([]Process, 0, len(procs))
	for _, p := range procs {
		out = append(out, snapshot(p))
	}

	sort.Slice(out, func(i, j int) bool { return out[i].CPU > out[j].CPU })
	return out, nil
}

// snapshot reads a single process into a Process. Best-effort: any field that
// can't be read (permissions, race with exit) is left at its zero value.
func snapshot(p *process.Process) Process {
	name, _ := p.Name()
	user, _ := p.Username()
	ppid, _ := p.Ppid()
	cmdline, _ := p.Cmdline()

	status := ""
	if s, err := p.Status(); err == nil && len(s) > 0 {
		status = s[0]
	}

	cpu, _ := p.CPUPercent()
	mem, _ := p.MemoryPercent()

	var started time.Time
	var uptime int64
	if ct, err := p.CreateTime(); err == nil && ct > 0 {
		started = time.UnixMilli(ct)
		uptime = int64(time.Since(started).Seconds())
	}

	return Process{
		PID:       p.Pid,
		PPID:      ppid,
		Name:      name,
		User:      user,
		Status:    status,
		CPU:       cpu,
		Mem:       mem,
		Cmdline:   cmdline,
		Started:   started,
		UptimeSec: uptime,
	}
}

// systemPrefixes are executable-path prefixes for OS-managed processes that are
// children of launchd (PID 1) by design — GUI apps, system daemons, login
// services. They are NOT orphans.
var systemPrefixes = []string{
	"/System/", "/Library/Apple/", "/Applications/",
	"/usr/libexec/", "/usr/sbin/", "/usr/bin/", "/sbin/", "/bin/",
}

// LikelyOrphan reports whether a process is *probably* an orphan: a user-space
// process reparented to launchd (PID 1) because the parent that spawned it —
// typically a terminal/shell — has exited.
//
// PPID 1 alone is NOT enough: on macOS launchd is the legitimate parent of the
// majority of processes (most GUI apps and system daemons), so we exclude those
// by executable path. This is a heuristic, not a guarantee (e.g. brew-managed
// services also run under launchd), so callers should hedge their wording.
func LikelyOrphan(ppid int32, cmdline string) bool {
	if ppid != 1 {
		return false
	}
	cmd := strings.TrimSpace(cmdline)
	if cmd == "" {
		return false // unreadable cmdline → a system/root process we can't classify
	}
	exe := cmd
	if i := strings.IndexByte(cmd, ' '); i >= 0 {
		exe = cmd[:i] // first token is the executable
	}
	for _, p := range systemPrefixes {
		if strings.HasPrefix(exe, p) {
			return false
		}
	}
	// Anything under a Library/ dir — /Library, ~/Library, /System/Library — is
	// app support, a framework helper, or a login agent that launchd manages on
	// purpose (CoreSimulator, updaters, JetBrains/Codex daemons, …).
	if strings.Contains(exe, "/Library/") {
		return false
	}
	return true
}

// Ancestry returns the parent chain for pid, ordered from the process itself up
// to the root (PID 1 / launchd). The first element is pid, the last is the
// topmost reachable ancestor. This is the process "족보": who launched whom.
// A reparented orphan (e.g. a detached dev server whose terminal closed) shows
// up here as a short chain ending directly at PID 1.
func Ancestry(pid int32) ([]Process, error) {
	if pid <= 0 {
		return nil, fmt.Errorf("invalid pid %d", pid)
	}
	var chain []Process
	seen := map[int32]bool{}
	cur := pid
	for cur > 0 && !seen[cur] {
		seen[cur] = true
		p, err := process.NewProcess(cur)
		if err != nil {
			if len(chain) == 0 {
				return nil, fmt.Errorf("pid %d: %w", cur, err)
			}
			break // parent vanished or unreadable; return what we have
		}
		chain = append(chain, snapshot(p))
		ppid, err := p.Ppid()
		if err != nil || ppid == cur {
			break
		}
		cur = ppid
	}
	return chain, nil
}

func loadProcesses() tea.Msg {
	items, err := Gather()
	if err != nil {
		return errMsg{err}
	}
	return processesMsg(items)
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

	filterStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("214")).
			Bold(true)
)
