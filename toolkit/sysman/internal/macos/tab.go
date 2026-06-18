package macos

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// subTab identifies which inner view of the Maintenance (macOS) tab is shown.
// The two are switched with ←/→ (the top-level tab row uses tab / number keys,
// and the tables use ↑/↓, so left/right are free for the sub-tabs).
type subTab int

const (
	subMaint     subTab = iota // 유지보수: Spotlight repair + pmset sleep toggle
	subUninstall               // 앱 제거: app uninstaller (bundle + leftovers)
)

var subTabNames = []string{"유지보수", "앱 제거"}

// subBarRows is how many rows the sub-tab strip occupies; the active sub-view
// gets the rest of the body.
const subBarRows = 1

// Model is the Maintenance (macOS) tab — a small shell hosting two sub-tabs.
// app.go embeds it by value as m.sys and drives it like any other view
// (Init/Update/View/SetSize/Detail), plus FooterHint/Filtering which it exposes
// so the parent's footer and filter-capture logic stay correct per sub-tab.
type Model struct {
	width, height int
	sub           subTab

	maint  maintModel
	uninst uninstallModel

	// uninstLoaded gates the one-time, lazy app-list scan: the uninstaller's
	// directory walk only runs the first time the user opens its sub-tab, not at
	// startup (when they may never visit it).
	uninstLoaded bool
}

// New returns the Maintenance tab with the 유지보수 sub-tab focused.
func New() Model {
	return Model{maint: newMaint(), uninst: newUninstall()}
}

// Init loads the 유지보수 sub-tab's status; the uninstaller loads lazily on first
// visit (see Update's ←/→ handling).
func (m Model) Init() tea.Cmd { return m.maint.Init() }

// SetSize splits the body: one row for the sub-tab strip, the rest for the
// active sub-view (both sub-views are sized so switching is instant).
func (m *Model) SetSize(w, h int) {
	m.width, m.height = w, h
	bh := h - subBarRows
	if bh < 1 {
		bh = 1
	}
	m.maint.SetSize(w, bh)
	m.uninst.SetSize(w, bh)
}

// Filtering reports whether the active sub-view is capturing filter keystrokes,
// so the parent shell knows not to treat keys as global shortcuts.
func (m Model) Filtering() bool {
	return m.sub == subUninstall && m.uninst.Filtering()
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		// While the active sub-view captures filter input, every key belongs to
		// it — don't steal ←/→ as sub-tab switches.
		if m.Filtering() {
			var cmd tea.Cmd
			m.uninst, cmd = m.uninst.Update(msg)
			return m, cmd
		}

		switch msg.String() {
		case "left", "right":
			var cmd tea.Cmd
			if m.sub == subMaint {
				m.sub = subUninstall
				if !m.uninstLoaded { // lazy first load
					m.uninstLoaded = true
					cmd = m.uninst.Init()
				}
			} else {
				m.sub = subMaint
			}
			return m, cmd
		}

		var cmd tea.Cmd
		if m.sub == subMaint {
			m.maint, cmd = m.maint.Update(msg)
		} else {
			m.uninst, cmd = m.uninst.Update(msg)
		}
		return m, cmd
	}

	// Non-key messages (status loads, scan/remove results, spinner ticks) are
	// broadcast to BOTH sub-models so an async op started on one keeps running
	// even after the user switches away. Each ignores message types it doesn't
	// recognize.
	var maintCmd, uninstCmd tea.Cmd
	m.maint, maintCmd = m.maint.Update(msg)
	m.uninst, uninstCmd = m.uninst.Update(msg)
	return m, tea.Batch(maintCmd, uninstCmd)
}

func (m Model) View() string {
	body := m.maint.View()
	if m.sub == subUninstall {
		body = m.uninst.View()
	}
	return m.subBar() + "\n" + body
}

// Detail is the line the parent shell renders under the body for the active
// sub-view.
func (m Model) Detail() string {
	if m.sub == subUninstall {
		return m.uninst.Detail()
	}
	return m.maint.Detail()
}

// FooterHint is the key legend the parent shell shows at the very bottom; it
// changes with the active sub-tab.
func (m Model) FooterHint() string {
	const nav = "tab 탭전환 · ←/→ 하위전환 · h 도움말 · "
	if m.sub == subUninstall {
		return nav + m.uninst.footerHint()
	}
	return nav + "r 새로고침 · e Spotlight 재색인 · s 잠자기방지 · q 종료"
}

// subBar renders the inner tab strip ("유지보수 | 앱 제거") with the active one
// highlighted.
func (m Model) subBar() string {
	var b strings.Builder
	for i, name := range subTabNames {
		if subTab(i) == m.sub {
			b.WriteString(subActiveStyle.Render(" " + name + " "))
		} else {
			b.WriteString(subIdleStyle.Render(" " + name + " "))
		}
		b.WriteString(" ")
	}
	b.WriteString(subHintStyle.Render(" ←/→ 전환"))
	return lipgloss.NewStyle().MaxWidth(max(m.width, 1)).Render(b.String())
}

var (
	subActiveStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	subIdleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("250")).
			Background(lipgloss.Color("236"))

	subHintStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("244"))
)
