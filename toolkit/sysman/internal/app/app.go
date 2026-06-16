// Package app holds the root Bubble Tea model: a tabbed shell that switches
// between the OS views (Ports, Processes), owns global key handling, and
// publishes the focused item to the state file for external tools.
package app

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/ports"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/process"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/state"
)

type view int

const (
	viewPorts view = iota
	viewProcesses
)

var tabNames = []string{"Ports", "Processes"}

// chromeHeight is the rows used by the title bar, tab row, divider, and footer
// (1 each). The active view gets the rest.
const chromeHeight = 4

// Model is the top-level tea.Model. Key events go to the focused view (unless
// that view is capturing filter input); all other messages are broadcast to
// every view so their refresh loops keep running on any tab.
type Model struct {
	active      view
	ports       ports.Model
	procs       process.Model
	width       int
	height      int
	showStarted bool // AGE columns show absolute start time instead of elapsed age
}

// New returns a Model with the Ports view selected (the primary use case).
func New() Model {
	return Model{
		active: viewPorts,
		ports:  ports.New(),
		procs:  process.New(),
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(m.ports.Init(), m.procs.Init())
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ports.SetSize(msg.Width, m.bodyHeight())
		m.procs.SetSize(msg.Width, m.bodyHeight())
		return m, nil

	case tea.KeyMsg:
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
			case "t":
				// Global toggle: AGE ⇄ absolute start time, on both views.
				m.showStarted = !m.showStarted
				m.ports.SetTimeMode(m.showStarted)
				m.procs.SetTimeMode(m.showStarted)
				return m, nil
			}
		}

		var cmd tea.Cmd
		switch m.active {
		case viewPorts:
			m.ports, cmd = m.ports.Update(msg)
		case viewProcesses:
			m.procs, cmd = m.procs.Update(msg)
		}
		m.publishFocus()
		return m, cmd
	}

	// Non-key messages are broadcast to both views; each ignores message types
	// it doesn't recognize, so refresh loops stay alive on any tab.
	var portsCmd, procsCmd tea.Cmd
	m.ports, portsCmd = m.ports.Update(msg)
	m.procs, procsCmd = m.procs.Update(msg)
	m.publishFocus()
	return m, tea.Batch(portsCmd, procsCmd)
}

func (m Model) View() string {
	title := titleStyle.Width(max(m.width, 1)).Render(" sysman · System Manager")
	tabs := m.renderTabs()
	divider := dividerStyle.Render(strings.Repeat("─", max(m.width, 1)))

	var body string
	switch m.active {
	case viewPorts:
		body = m.ports.View()
	case viewProcesses:
		body = m.procs.View()
	}

	footer := footerStyle.Render("tab/1-2 switch · ↑/↓ navigate · / filter · t age⇄time · r refresh · k kill · K force-kill · q quit")
	return lipgloss.JoinVertical(lipgloss.Left, title, tabs, divider, body, footer)
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
)
