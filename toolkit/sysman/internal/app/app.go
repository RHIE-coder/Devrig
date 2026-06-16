// Package app holds the root Bubble Tea model: a tabbed shell that switches
// between the OS views (Ports, Processes), owns global key handling, and
// publishes the focused item to the state file for external tools.
package app

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/macos"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/ports"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/process"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/state"
)

type view int

const (
	viewPorts view = iota
	viewProcesses
	viewSystem // macOS-only; reachable only when systemTabEnabled (see tabs_*.go)
)

// tabNames and systemTabEnabled are defined per-OS in tabs_darwin.go /
// tabs_other.go so the System tab only appears on macOS.

// chromeHeight is the rows used by the title bar, tab row, divider, detail line,
// and footer (1 each). The active view gets the rest.
const chromeHeight = 5

// Model is the top-level tea.Model. Key events go to the focused view (unless
// that view is capturing filter input); all other messages are broadcast to
// every view so their refresh loops keep running on any tab.
type Model struct {
	active      view
	ports       ports.Model
	procs       process.Model
	sys         macos.Model // System tab (macOS-only; inert when systemTabEnabled is false)
	width       int
	height      int
	showStarted bool // AGE columns show absolute start time instead of elapsed age

	// Ancestry overlay: a point-in-time parent chain (족보) for the focused
	// process, shown over the table when the user presses 't'.
	showTree  bool
	treePID   int32
	treeChain []process.Process
	treeErr   error
}

// New returns a Model with the Ports view selected (the primary use case).
func New() Model {
	return Model{
		active: viewPorts,
		ports:  ports.New(),
		procs:  process.New(),
		sys:    macos.New(),
	}
}

func (m Model) Init() tea.Cmd {
	cmds := []tea.Cmd{m.ports.Init(), m.procs.Init()}
	if systemTabEnabled {
		cmds = append(cmds, m.sys.Init())
	}
	return tea.Batch(cmds...)
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ports.SetSize(msg.Width, m.bodyHeight())
		m.procs.SetSize(msg.Width, m.bodyHeight())
		m.sys.SetSize(msg.Width, m.bodyHeight())
		return m, nil

	case tea.KeyMsg:
		// The ancestry overlay captures keys while open: esc/t close it, quit
		// keys still quit, everything else is ignored so the table underneath
		// doesn't move.
		if m.showTree {
			switch msg.String() {
			case "ctrl+c", "q":
				return m, tea.Quit
			case "esc", "t":
				m.showTree = false
			}
			return m, nil
		}

		// While the active view is capturing filter input, every key belongs to
		// it — don't steal "q", "1", etc. as global shortcuts.
		if !m.activeFiltering() {
			switch msg.String() {
			case "ctrl+c", "q":
				return m, tea.Quit
			case "tab":
				m.active = (m.active + 1) % view(len(tabNames))
				m.publishFocus()
				return m, nil
			case "1":
				m.active = viewPorts
				m.publishFocus()
				return m, nil
			case "2":
				m.active = viewProcesses
				m.publishFocus()
				return m, nil
			case "3":
				if systemTabEnabled {
					m.active = viewSystem
					m.publishFocus()
				}
				return m, nil
			case "a":
				// Global toggle: AGE ⇄ absolute start time, on both views.
				m.showStarted = !m.showStarted
				m.ports.SetTimeMode(m.showStarted)
				m.procs.SetTimeMode(m.showStarted)
				return m, nil
			case "t":
				// Open the ancestry (족보) overlay for the focused process.
				if pid := m.focusedPID(); pid > 0 {
					m.treePID = pid
					m.treeChain, m.treeErr = process.Ancestry(pid)
					m.showTree = true
				}
				return m, nil
			}
		}

		var cmd tea.Cmd
		switch m.active {
		case viewPorts:
			m.ports, cmd = m.ports.Update(msg)
		case viewProcesses:
			m.procs, cmd = m.procs.Update(msg)
		case viewSystem:
			m.sys, cmd = m.sys.Update(msg)
		}
		m.publishFocus()
		return m, cmd
	}

	// Non-key messages are broadcast to every view; each ignores message types
	// it doesn't recognize, so refresh loops (and the System tab's async ops)
	// stay alive on any tab.
	var portsCmd, procsCmd, sysCmd tea.Cmd
	m.ports, portsCmd = m.ports.Update(msg)
	m.procs, procsCmd = m.procs.Update(msg)
	m.sys, sysCmd = m.sys.Update(msg)
	m.publishFocus()
	return m, tea.Batch(portsCmd, procsCmd, sysCmd)
}

func (m Model) View() string {
	title := titleStyle.Width(max(m.width, 1)).Render(" sysman · System Manager")
	tabs := m.renderTabs()
	divider := dividerStyle.Render(strings.Repeat("─", max(m.width, 1)))

	var body, detail string
	if m.showTree {
		body = m.renderTree()
		detail = detailHintStyle.Render("족보(ancestry) · esc/t 닫기")
	} else {
		switch m.active {
		case viewPorts:
			body = m.ports.View()
		case viewProcesses:
			body = m.procs.View()
		case viewSystem:
			body = m.sys.View()
		}
		detail = m.renderDetail()
	}

	footer := footerStyle.Render(m.footerHint())
	return lipgloss.JoinVertical(lipgloss.Left, title, tabs, divider, body, detail, footer)
}

// footerHint returns the key legend for the active tab. The table tabs share
// one legend; the System tab has its own actions.
func (m Model) footerHint() string {
	if m.active == viewSystem {
		return "tab switch · r refresh · e Spotlight 재색인 · s 잠자기방지 토글 · q quit"
	}
	return "tab switch · ↑/↓ navigate · / filter · t tree · a age⇄time · r refresh · k kill · K force-kill · q quit"
}

// focusedPID returns the PID selected in the active view (0 if none).
func (m Model) focusedPID() int32 {
	switch m.active {
	case viewPorts:
		return m.ports.FocusedPID()
	case viewProcesses:
		return m.procs.FocusedPID()
	}
	return 0
}

// renderDetail is the always-visible line under the table: the selected row's
// parent and the exact command it was launched with — the two things the table
// columns don't have room for.
func (m Model) renderDetail() string {
	if m.active == viewSystem {
		return truncate(m.sys.Detail(), max(m.width, 1))
	}

	var ppid int32
	var name, cmdline string
	var ok bool
	switch m.active {
	case viewPorts:
		ppid, name, cmdline, ok = m.ports.FocusedDetail()
	case viewProcesses:
		ppid, name, cmdline, ok = m.procs.FocusedDetail()
	}
	if !ok {
		return detailHintStyle.Render("(no selection)")
	}

	head := detailKeyStyle.Render(fmt.Sprintf("PPID %d", ppid))
	if process.LikelyOrphan(ppid, cmdline) {
		head += treeOrphanStyle.Render(" (고아 가능성·" + process.InitName() + " 직속)")
	} else if process.IsRootParent(ppid) {
		head += detailHintStyle.Render(" (" + process.InitName() + " 직속)")
	}
	if name != "" {
		head += detailStyle.Render(" · " + name)
	}

	var cmd string
	if c := strings.TrimSpace(cmdline); c != "" {
		cmd = detailStyle.Render(" · " + c)
	} else {
		cmd = detailHintStyle.Render(" · (no cmdline — 시스템/root 프로세스, sudo 필요)")
	}

	return truncate(head+cmd, max(m.width, 1))
}

// renderTree draws the focused process's ancestry: itself at the top, each
// parent indented below, up to the root process. Each node shows how it was
// launched.
func (m Model) renderTree() string {
	var b strings.Builder
	b.WriteString(treeTitleStyle.Render(fmt.Sprintf("Ancestry of PID %d — 부모 체인 (root까지)", m.treePID)))

	if m.treeErr != nil {
		b.WriteString("\n" + detailHintStyle.Render("  error: "+m.treeErr.Error()))
		return b.String()
	}
	if len(m.treeChain) == 0 {
		b.WriteString("\n" + detailHintStyle.Render("  (no ancestry)"))
		return b.String()
	}

	// Cap depth to the body so a very deep chain can't overflow the screen.
	limit := m.bodyHeight() - 1
	if limit < 1 {
		limit = 1
	}
	for i, p := range m.treeChain {
		b.WriteString("\n") // the title above already occupies the first row
		if i >= limit {
			b.WriteString(detailHintStyle.Render(fmt.Sprintf("  … +%d more", len(m.treeChain)-i)))
			break
		}
		prefix := strings.Repeat("  ", i)
		if i > 0 {
			prefix += "└─ "
		}
		node := fmt.Sprintf("%s%d %s", prefix, p.PID, p.Name)
		if process.LikelyOrphan(p.PPID, p.Cmdline) {
			node += treeOrphanStyle.Render("  (고아 가능성)")
		} else if process.IsRootParent(p.PPID) {
			node += detailHintStyle.Render("  (" + process.InitName() + " 직속)")
		}
		line := treeNodeStyle.Render(node)
		if c := strings.TrimSpace(p.Cmdline); c != "" {
			line += treeCmdStyle.Render("  « " + c + " »")
		} else {
			line += detailHintStyle.Render("  « no cmdline (sudo 필요) »")
		}
		b.WriteString(truncate(line, max(m.width, 1)))
	}

	// Pad to the full body height so the detail/footer stay anchored to the
	// bottom, matching the table layout.
	out := b.String()
	for rows := strings.Count(out, "\n") + 1; rows < m.bodyHeight(); rows++ {
		out += "\n"
	}
	return out
}

func (m Model) activeFiltering() bool {
	switch m.active {
	case viewPorts:
		return m.ports.Filtering()
	case viewProcesses:
		return m.procs.Filtering()
	}
	return false
}

// publishFocus writes the current screen (active view, filter, focused row, and
// visible rows) to the state file so external tools (Claude, Codex) can see
// exactly what the user is looking at and pointing at.
func (m Model) publishFocus() {
	snap := state.Snapshot{View: strings.ToLower(tabNames[m.active])}
	switch m.active {
	case viewPorts:
		snap.Filter = m.ports.Filter()
		snap.Focused = m.ports.Focused()
		snap.Visible = m.ports.Visible()
	case viewProcesses:
		snap.Filter = m.procs.Filter()
		snap.Focused = m.procs.Focused()
		snap.Visible = m.procs.Visible()
	}
	state.Write(snap)
}

// truncate clips a single styled line to w terminal cells, ANSI-aware so it
// never cuts through an escape sequence.
func truncate(s string, w int) string {
	return lipgloss.NewStyle().MaxWidth(w).Render(s)
}

func (m Model) bodyHeight() int {
	if h := m.height - chromeHeight; h > 1 {
		return h
	}
	return 1
}

func (m Model) renderTabs() string {
	var b strings.Builder
	for i, name := range tabNames {
		if view(i) == m.active {
			b.WriteString(activeTabStyle.Render("▌ " + name + " "))
		} else {
			b.WriteString(tabStyle.Render("  " + name + " "))
		}
		b.WriteString(" ")
	}
	b.WriteString(tabHintStyle.Render("  (tab ⇄)"))
	return b.String()
}

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("63"))

	tabStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	activeTabStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	tabHintStyle = lipgloss.NewStyle().
			Faint(true).
			Foreground(lipgloss.Color("240"))

	dividerStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("238"))

	footerStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			Padding(0, 1)

	// Detail line (selected row's parent + launch command).
	detailStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("250"))

	detailKeyStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("75"))

	detailHintStyle = lipgloss.NewStyle().
			Faint(true).
			Foreground(lipgloss.Color("240"))

	// Ancestry overlay.
	treeTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	treeNodeStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("252"))

	treeCmdStyle = lipgloss.NewStyle().
			Faint(true).
			Foreground(lipgloss.Color("245"))

	treeOrphanStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("214"))
)
