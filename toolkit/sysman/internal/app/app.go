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
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/metrics"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/ports"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/process"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/state"
)

type view int

const (
	// viewMetrics is the default landing tab: device status, hardware spec and
	// live metrics. It is displayed to users as "System" (see tabNames in
	// tabs_*.go) — the const keeps its implementation name (the metrics package).
	viewMetrics view = iota
	viewPorts
	viewProcesses
	// viewSystem is the macOS-only maintenance tab (Spotlight/sleep), displayed
	// as "Maintenance (macOS)". Reachable only when systemTabEnabled.
	viewSystem
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
	metrics     metrics.Model // Metrics tab (cross-platform device health)
	sys         macos.Model   // System tab (macOS-only; inert when systemTabEnabled is false)
	width       int
	height      int
	showStarted bool // AGE columns show absolute start time instead of elapsed age

	// Ancestry overlay: a point-in-time parent chain (족보) for the focused
	// process, shown over the table when the user presses 't'.
	showTree  bool
	treePID   int32
	treeChain []process.Process
	treeErr   error

	// Help overlay: a plain-language guide to the screen, shown over the body
	// when the user presses 'h'.
	showHelp bool
}

// New returns a Model with the Ports view selected (the primary use case).
func New() Model {
	return Model{
		active:  viewMetrics, // device status is the landing tab
		ports:   ports.New(),
		procs:   process.New(),
		metrics: metrics.New(),
		sys:     macos.New(),
	}
}

func (m Model) Init() tea.Cmd {
	cmds := []tea.Cmd{m.ports.Init(), m.procs.Init(), m.metrics.Init()}
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
		m.metrics.SetSize(msg.Width, m.bodyHeight())
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

		// The help overlay captures keys the same way: esc/h/q close it.
		if m.showHelp {
			switch msg.String() {
			case "ctrl+c", "q":
				return m, tea.Quit
			case "esc", "h", "?":
				m.showHelp = false
			}
			return m, nil
		}

		// While the active view is capturing filter input, every key belongs to
		// it — don't steal "q", "1", etc. as global shortcuts.
		if !m.activeFiltering() {
			switch msg.String() {
			case "ctrl+c", "q":
				return m, tea.Quit
			case "h", "?":
				m.showHelp = true
				return m, nil
			case "tab":
				m.active = (m.active + 1) % view(len(tabNames))
				m.publishFocus()
				return m, nil
			case "1":
				m.active = viewMetrics
				m.publishFocus()
				return m, nil
			case "2":
				m.active = viewPorts
				m.publishFocus()
				return m, nil
			case "3":
				m.active = viewProcesses
				m.publishFocus()
				return m, nil
			case "4":
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
		case viewMetrics:
			m.metrics, cmd = m.metrics.Update(msg)
		case viewSystem:
			m.sys, cmd = m.sys.Update(msg)
		}
		m.publishFocus()
		return m, cmd
	}

	// Non-key messages are broadcast to every view; each ignores message types
	// it doesn't recognize, so refresh loops (and the System tab's async ops)
	// stay alive on any tab.
	var portsCmd, procsCmd, metricsCmd, sysCmd tea.Cmd
	m.ports, portsCmd = m.ports.Update(msg)
	m.procs, procsCmd = m.procs.Update(msg)
	m.metrics, metricsCmd = m.metrics.Update(msg)
	m.sys, sysCmd = m.sys.Update(msg)
	m.publishFocus()
	return m, tea.Batch(portsCmd, procsCmd, metricsCmd, sysCmd)
}

func (m Model) View() string {
	// The brand ("SYSMAN") and its description ("System Manager") get distinct
	// styling so the bar reads as one name + a subtitle, not two names.
	brand := brandStyle.Render(" SYSMAN ")
	subtitle := subtitleStyle.Render(" System Manager ")
	title := titleBarStyle.Width(max(m.width, 1)).Render(brand + subtitle)
	tabs := m.renderTabs()
	divider := dividerStyle.Render(strings.Repeat("─", max(m.width, 1)))

	var body, detail string
	switch {
	case m.showHelp:
		body = m.renderHelp()
		detail = detailHintStyle.Render("도움말 · esc/h 닫기")
	case m.showTree:
		body = m.renderTree()
		detail = detailHintStyle.Render("족보(ancestry) · esc/t 닫기")
	default:
		switch m.active {
		case viewPorts:
			body = m.ports.View()
		case viewProcesses:
			body = m.procs.View()
		case viewMetrics:
			body = m.metrics.View()
		case viewSystem:
			body = m.sys.View()
		}
		detail = m.renderDetail()
	}

	footer := footerStyle.Render(m.footerHint())
	return lipgloss.JoinVertical(lipgloss.Left, title, tabs, divider, body, detail, footer)
}

// footerHint returns the key legend for the active tab. The table tabs share
// one legend; the System and Maintenance tabs have their own actions. 'h' for
// help is always available.
func (m Model) footerHint() string {
	switch m.active {
	case viewSystem:
		return m.sys.FooterHint()
	case viewMetrics:
		return "tab 전환 · h 도움말(용어 설명) · r 새로고침 · q 종료"
	}
	return "tab 전환 · h 도움말 · ↑/↓ 이동 · / 필터 · t 족보 · a 시간표시 · r 새로고침 · k 종료 · K 강제종료 · q 종료"
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
	switch m.active {
	case viewSystem:
		return truncate(m.sys.Detail(), max(m.width, 1))
	case viewMetrics:
		return truncate(m.metrics.Detail(), max(m.width, 1))
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

// renderHelp draws the System-tab term glossary shown when the user presses
// 'h'. It explains the metrics/jargon on the System screen in plain language —
// it is intentionally NOT a whole-app usage guide (tabs/keys live in the
// footer), just "what does this number mean?".
func (m Model) renderHelp() string {
	h := helpHeadStyle.Render
	t := detailStyle.Render
	d := helpDimStyle.Render

	lines := []string{
		helpTitleStyle.Render(" 📖 System 탭 용어 설명 — 이 숫자가 무슨 뜻? "),
		"",
		h("게이지") + t("     ████░░ 채워질수록 사용률↑  ") + d("초록<60% · 노랑<85% · 빨강 위험"),
		h("CPU") + t("        프로세서 사용률. ") + d("'코어별'=코어 하나하나의 부하 막대"),
		h("부하(load)") + t("  최근 1·5·15분 평균 대기 작업 수. ") + d("코어 수보다 크면 일이 밀리는 중"),
		h("프로세스") + t("   실행=지금 도는 것 · ") + t("I/O대기") + d("=디스크·네트워크 기다리는 중(보통 정상, 위험 아님)"),
		h("MEM") + t("        메모리 사용량. ") + d("고정(wired)=OS가 못 비움 · 사용중(active) · 재사용가능(inactive)=캐시"),
		h("SWP") + t("        스왑 = RAM이 모자라 디스크로 밀어낸 메모리. ") + d("높으면 RAM 부족 신호"),
		h("NET") + t("        연결 상태 = 온라인/오프라인 + ") + t("지연(latency)") + d("ms(낮을수록 빠름: <80 좋음). ↑업로드·↓다운로드 속도, 괄호=누적량"),
		h("DSK") + t("        디스크 사용률 + 읽기/쓰기 속도 + ") + t("IOPS") + d("(초당 입출력 횟수)"),
		h("TMP") + t("        하드웨어 온도 = 그룹 평균 + 지금 가장 뜨거운 센서. ") + d("상한 아닌 실시간 값(부하 시 ~100°)"),
		t("            ") + d("SoC = CPU·GPU가 한 칩에 통합된 형태(Apple Silicon 등). 일반 PC는 사실상 CPU 온도"),
		h("배터리") + t("     잔량%·충전/방전 상태 + ") + t("수명") + d("(최대용량% · 누적 충전 횟수 · 상태)"),
		h("가동") + t("       기기를 마지막으로 켠 뒤 흐른 총 시간 + 부팅 시각"),
		"",
		d(" esc 또는 h 로 닫기  ·  탭 전환·단축키는 화면 맨 아래 푸터를 보세요"),
	}

	// Clip each line to width and pad/truncate to the body height so the
	// detail/footer stay anchored (matching the other views).
	bh := m.bodyHeight()
	for i := range lines {
		lines[i] = truncate(lines[i], max(m.width, 1))
	}
	for len(lines) < bh {
		lines = append(lines, "")
	}
	if len(lines) > bh {
		lines = lines[:bh]
	}
	return strings.Join(lines, "\n")
}

func (m Model) activeFiltering() bool {
	switch m.active {
	case viewPorts:
		return m.ports.Filtering()
	case viewProcesses:
		return m.procs.Filtering()
	case viewSystem:
		return m.sys.Filtering()
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
	case viewMetrics:
		// The whole live device reading is the "focused" item for the System
		// tab, so Claude/Codex can answer about exactly what's on screen.
		snap.Focused = m.metrics.State()
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
	// titleBarStyle paints the full-width header background; the brand and
	// subtitle below carry their own foregrounds so they're visually distinct.
	titleBarStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("63"))

	// Brand: uppercase SYSMAN as a gold "badge" on a darker inset so it reads as
	// the product name, clearly distinct from the italic description beside it.
	brandStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("220")). // gold — the app name, the headline
			Background(lipgloss.Color("54"))   // deep indigo inset

	subtitleStyle = lipgloss.NewStyle().
			Italic(true).
			Foreground(lipgloss.Color("253")). // near-white, italic — the description
			Background(lipgloss.Color("63"))

	tabStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("250"))

	activeTabStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	tabHintStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("244"))

	dividerStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("240"))

	footerStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("247")).
			Padding(0, 1)

	// Detail line (selected row's parent + launch command).
	detailStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("252"))

	detailKeyStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("75"))

	detailHintStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	// Help overlay.
	helpTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	helpHeadStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("75"))

	helpDimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	// Ancestry overlay.
	treeTitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	treeNodeStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("252"))

	treeCmdStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245"))

	treeOrphanStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("214"))
)
