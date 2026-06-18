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
	PPID      int32     `json:"ppid"` // parent PID (0 if unknown); follow upward for the ancestry chain
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
	// processesMsg carries the freshly gathered list plus the CPU-time baseline
	// it sampled, which the model stores to diff against on the next tick.
	processesMsg struct {
		procs   []Process
		samples map[int32]cpuSample
	}
	errMsg  struct{ err error }
	tickMsg time.Time
)

// cpuSample is one process's cumulative CPU time (user+system, seconds) at a
// moment. CPU% is the rise in this value over the wall-clock gap between two
// samples — i.e. the share of a core used *during that window*, not the
// lifetime average gopsutil's CPUPercent() would give.
type cpuSample struct {
	secs float64
	at   time.Time
}

// cpuSamplePause is the short gap used to measure usage when there is no prior
// baseline (the first tick, and the one-shot `--json ps` headless mode).
const cpuSamplePause = 350 * time.Millisecond

// Model is the Processes view (a sub-model embedded by the parent).
type Model struct {
	table       table.Model
	all         []Process
	shown       []Process
	err         error
	nameW       int
	filter      string
	filtering   bool
	showStarted bool // AGE column shows absolute start time instead of elapsed age

	// prevCPU is the previous tick's CPU-time baseline, keyed by PID, used to
	// compute each process's current (interval) CPU% instead of its lifetime
	// average.
	prevCPU map[int32]cpuSample
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
	return tea.Batch(m.load(), tick())
}

// load gathers the next process snapshot, diffing CPU times against the
// previous tick's baseline so CPU% reflects current usage. It mirrors the
// metrics view's prev-snapshot pattern.
func (m Model) load() tea.Cmd {
	prev := m.prevCPU
	return func() tea.Msg {
		procs, samples, err := gather(prev)
		if err != nil {
			return errMsg{err}
		}
		return processesMsg{procs: procs, samples: samples}
	}
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
		m.all = msg.procs
		m.prevCPU = msg.samples
		m.applyFilter()
		return m, nil

	case errMsg:
		m.err = msg.err
		return m, nil

	case tickMsg:
		return m, tea.Batch(m.load(), tick())

	case tea.KeyMsg:
		if m.filtering {
			return m.updateFilter(msg)
		}
		switch msg.String() {
		case "/":
			m.filtering = true
			return m, nil
		case "r":
			return m, m.load()
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
	prev := m.prevCPU
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
		procs, samples, err := gather(prev)
		if err != nil {
			return errMsg{err}
		}
		return processesMsg{procs: procs, samples: samples}
	}
}

// Gather collects a snapshot of all processes, sorted by CPU descending, for the
// one-shot `--json ps` headless mode. With no prior baseline it takes two
// readings cpuSamplePause apart so CPU% is the *current* usage, not a lifetime
// average.
func Gather() ([]Process, error) {
	procs, _, err := gather(nil)
	return procs, err
}

// gather reads every process and computes each one's CPU% as the rise in its
// CPU time over the gap since prev's matching sample (≈ the share of one core
// used during that window). It returns the list plus a fresh baseline to diff
// against next time. When prev is empty (first tick / headless), it primes a
// baseline and waits cpuSamplePause so the very first numbers are real too.
func gather(prev map[int32]cpuSample) ([]Process, map[int32]cpuSample, error) {
	base := prev
	if len(base) == 0 {
		base = sampleCPUTimes()
		time.Sleep(cpuSamplePause)
	}

	procs, err := process.Processes()
	if err != nil {
		return nil, prev, err
	}

	out := make([]Process, 0, len(procs))
	next := make(map[int32]cpuSample, len(procs))
	for _, p := range procs {
		pr := snapshot(p)
		if secs, ok := procCPUSecs(p); ok {
			// Stamp each read at its own moment: reading Times for hundreds of
			// processes takes hundreds of ms, so a single shared timestamp would
			// mis-scale every process's rate. A per-process dt keeps it exact.
			cur := cpuSample{secs: secs, at: time.Now()}
			next[p.Pid] = cur
			if b, had := base[p.Pid]; had {
				if v, ok := cpuRate(b, cur); ok {
					pr.CPU = v // 100% == one core, over the window
				}
			}
			// No baseline yet (brand-new process): CPU stays 0 for one tick,
			// then becomes accurate — never a misleading lifetime average.
		}
		out = append(out, pr)
	}

	sort.Slice(out, func(i, j int) bool { return out[i].CPU > out[j].CPU })
	return out, next, nil
}

// cpuRate computes interval CPU% from two cumulative-CPU-time samples: the rise
// in CPU seconds over the wall-clock gap between them, scaled so 100% == one
// core fully busy for the whole window. ok is false when the rate isn't
// meaningful — a non-positive time gap (clock skew, same instant) or a
// non-positive delta (an idle process, or a counter that didn't advance) — and
// the caller leaves CPU at 0 rather than show a bogus number.
func cpuRate(prev, cur cpuSample) (float64, bool) {
	dt := cur.at.Sub(prev.at).Seconds()
	if dt <= 0 {
		return 0, false
	}
	if v := (cur.secs - prev.secs) / dt * 100; v > 0 {
		return v, true
	}
	return 0, false
}

// sampleCPUTimes reads every process's cumulative CPU time once, stamped now —
// the baseline for the first interval.
func sampleCPUTimes() map[int32]cpuSample {
	procs, err := process.Processes()
	if err != nil {
		return map[int32]cpuSample{}
	}
	m := make(map[int32]cpuSample, len(procs))
	for _, p := range procs {
		if secs, ok := procCPUSecs(p); ok {
			m[p.Pid] = cpuSample{secs: secs, at: time.Now()}
		}
	}
	return m
}

// procCPUSecs returns a process's cumulative CPU seconds (user+system). Using
// the raw times (not gopsutil's CPUPercent) lets us diff two readings for the
// interval rate.
func procCPUSecs(p *process.Process) (float64, bool) {
	t, err := p.Times()
	if err != nil || t == nil {
		return 0, false
	}
	return t.User + t.System, true
}

// snapshot reads a single process's descriptive fields. CPU is left at 0 here
// and filled in by gather (from the interval diff); Mem is the live RSS share.
// Best-effort: any field that can't be read is left at its zero value.
func snapshot(p *process.Process) Process {
	name, _ := p.Name()
	user, _ := p.Username()
	ppid, _ := p.Ppid()
	cmdline, _ := p.Cmdline()

	status := ""
	if s, err := p.Status(); err == nil && len(s) > 0 {
		status = s[0]
	}

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
		Mem:       mem,
		Cmdline:   cmdline,
		Started:   started,
		UptimeSec: uptime,
	}
}

// The orphan heuristic (LikelyOrphan / IsRootParent / InitName) is OS-specific
// and lives in orphan_{darwin,linux,windows}.go behind the wrappers in
// orphan.go.

// Ancestry returns the parent chain for pid, ordered from the process itself up
// to the root (the OS init process, PID 1 on Unix). The first element is pid,
// the last is the topmost reachable ancestor. This is the process "족보": who
// launched whom.
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
