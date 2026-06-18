package macos

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ustate is the app-uninstaller's step in its flow.
type ustate int

const (
	uList     ustate = iota // browse/filter the installed apps
	uScanning               // finding the selected app's leftovers (async)
	uReview                 // show what will be removed; await y / X / n
	uRemoving               // moving to Trash or deleting (async)
)

// uninstallModel is the "앱 제거" sub-tab. It lists installed apps, scans the
// selected one for leftovers, shows the plan, and removes it (Trash by default,
// permanent on request). Scans/removals run async with a spinner; input is
// ignored while busy.
type uninstallModel struct {
	width, height int

	table     table.Model
	apps      []appEntry // every installed app
	shown     []appEntry // after the filter (matches table rows)
	filter    string
	filtering bool
	loaded    bool
	err       error

	state     ustate
	plan      removalPlan // populated when state >= uReview
	reviewOff int         // scroll offset within the review list

	busy    bool
	busyMsg string
	frame   int

	log    string
	logErr bool
}

type (
	appsLoadedMsg struct {
		apps []appEntry
		err  error
	}
	scanDoneMsg struct {
		plan removalPlan
		err  error
	}
	removeDoneMsg struct {
		label string
		out   string
		err   error
	}
	uTickMsg struct{}
)

func newUninstall() uninstallModel {
	t := table.New(table.WithFocused(true))
	s := table.DefaultStyles()
	s.Header = s.Header.BorderStyle(lipgloss.NormalBorder()).BorderBottom(true).Bold(true)
	s.Selected = s.Selected.
		Foreground(lipgloss.Color("231")).
		Background(lipgloss.Color("57")).
		Bold(true)
	t.SetStyles(s)
	return uninstallModel{table: t}
}

// Init kicks off the (lazy) app-list scan. The container calls it the first
// time the user opens this sub-tab.
func (m uninstallModel) Init() tea.Cmd { return loadAppsCmd() }

// Filtering reports whether the app list is capturing filter keystrokes.
func (m uninstallModel) Filtering() bool { return m.state == uList && m.filtering }

func (m *uninstallModel) SetSize(w, h int) {
	m.width = w
	if h < 2 {
		h = 2
	}
	m.height = h
	m.applyColumns()
	m.table.SetWidth(w)
	m.table.SetHeight(h - 1) // one row for the status/filter line
	m.setRows()
}

func (m uninstallModel) Update(msg tea.Msg) (uninstallModel, tea.Cmd) {
	switch msg := msg.(type) {
	case appsLoadedMsg:
		m.loaded = true
		m.apps, m.err = msg.apps, msg.err
		m.applyFilter()
		return m, nil

	case scanDoneMsg:
		m.busy, m.busyMsg = false, ""
		if msg.err != nil {
			m.state = uList
			m.log, m.logErr = "스캔 실패: "+msg.err.Error(), true
			return m, nil
		}
		m.plan = msg.plan
		m.reviewOff = 0
		m.state = uReview
		return m, nil

	case removeDoneMsg:
		m.busy, m.busyMsg = false, ""
		m.state = uList
		if msg.err != nil {
			if isCancel(msg.out, msg.err) {
				m.log, m.logErr = "• "+msg.label+" — 취소됨 (권한 미승인)", false
			} else {
				m.log, m.logErr = "✗ "+msg.label+" 실패: "+firstNonEmpty(collapse(msg.out), msg.err.Error()), true
			}
			return m, nil
		}
		m.log, m.logErr = "✓ "+msg.label, false
		return m, loadAppsCmd() // the app is gone — refresh the list

	case uTickMsg:
		if m.busy {
			m.frame++
			return m, uTick()
		}
		return m, nil

	case tea.KeyMsg:
		return m.updateKey(msg)
	}
	return m, nil
}

func (m uninstallModel) updateKey(key tea.KeyMsg) (uninstallModel, tea.Cmd) {
	if m.busy {
		return m, nil
	}
	switch m.state {
	case uReview:
		return m.updateReviewKey(key)
	case uList:
		if m.filtering {
			return m.updateFilter(key)
		}
		switch key.String() {
		case "/":
			m.filtering = true
			return m, nil
		case "r":
			m.log = ""
			return m, loadAppsCmd()
		case "enter":
			app, ok := m.selectedApp()
			if !ok {
				return m, nil
			}
			m.plan = removalPlan{}
			return m.startBusy(uScanning, "분석 중: "+app.Name+" 잔여 파일 검색…", scanCmd(app))
		}
		var cmd tea.Cmd
		m.table, cmd = m.table.Update(key) // ↑/↓ navigation
		return m, cmd
	}
	return m, nil
}

func (m uninstallModel) updateReviewKey(key tea.KeyMsg) (uninstallModel, tea.Cmd) {
	switch key.String() {
	case "y", "Y", "enter":
		return m.startBusy(uRemoving, "휴지통으로 이동 중…", removeCmd(m.plan, false))
	case "X", "d":
		return m.startBusy(uRemoving, "영구 삭제 중…", removeCmd(m.plan, true))
	case "n", "N", "esc":
		m.state = uList
		m.log, m.logErr = "취소했습니다.", false
		return m, nil
	case "up", "k":
		if m.reviewOff > 0 {
			m.reviewOff--
		}
	case "down", "j":
		if m.reviewOff < len(m.plan.Items)-1 {
			m.reviewOff++
		}
	}
	return m, nil
}

// startBusy enters a state with a spinner and launches its async command.
func (m uninstallModel) startBusy(next ustate, msg string, cmd tea.Cmd) (uninstallModel, tea.Cmd) {
	m.state = next
	m.busy, m.busyMsg = true, msg
	m.log = ""
	return m, tea.Batch(cmd, uTick())
}

func (m uninstallModel) updateFilter(key tea.KeyMsg) (uninstallModel, tea.Cmd) {
	switch key.String() {
	case "esc":
		m.filtering, m.filter = false, ""
		m.applyFilter()
	case "enter":
		m.filtering = false // keep filter applied, leave input mode
	case "backspace":
		if len(m.filter) > 0 {
			m.filter = m.filter[:len(m.filter)-1]
			m.applyFilter()
		}
	default:
		if len(key.Runes) > 0 {
			m.filter += string(key.Runes)
			m.applyFilter()
		}
	}
	return m, nil
}

func (m uninstallModel) View() string {
	switch m.state {
	case uScanning, uRemoving:
		return m.pad(busyStyle.Render(spinner[m.frame%len(spinner)]+" "+m.busyMsg) +
			"\n\n" + faintStyle.Render("  관리자 권한이 필요하면 시스템 대화상자를 확인하세요."))
	case uReview:
		return m.reviewView()
	default:
		return m.listView()
	}
}

func (m uninstallModel) listView() string {
	var status string
	switch {
	case !m.loaded:
		status = faintStyle.Render("앱 목록 읽는 중…")
	case m.err != nil:
		status = errStyle.Render("error: " + m.err.Error())
	case m.filtering || m.filter != "":
		cur := ""
		if m.filtering {
			cur = "_"
		}
		status = warnStyle.Render(fmt.Sprintf("검색 /%s%s  (%d/%d)  [esc 해제]", m.filter, cur, len(m.shown), len(m.apps)))
	case m.log != "":
		st := okStyle
		if m.logErr {
			st = errStyle
		}
		status = st.Render("» " + m.log)
	default:
		status = faintStyle.Render(fmt.Sprintf("%d개 앱 · enter 로 선택 앱 분석 → 잔재물까지 한번에 제거", len(m.shown)))
	}
	return m.table.View() + "\n" + clipLine(status, m.width)
}

func (m uninstallModel) reviewView() string {
	p := m.plan
	var b strings.Builder

	b.WriteString(headerStyle.Render(" 앱 제거 — " + p.App.Name + " "))
	b.WriteString("\n")
	bid := p.BundleID
	if bid == "" {
		bid = "(번들 ID 못 읽음 — 이름 기반 매칭만)"
	}
	b.WriteString(faintStyle.Render("  "+bid) + "    합계 " + keyStyle.Render(humanSize(p.TotalKB)) + faintStyle.Render(fmt.Sprintf(" · %d개 항목", len(p.Items))) + "\n")
	b.WriteString(descStyle.Render("  기본 [y]=휴지통(되돌리기 가능) · [X]=영구삭제(복구 불가)") + "\n")
	// Honesty note: we only list items confidently attributable to this app, so
	// a user doesn't read a small result as "that's all it left". Shared vendor
	// folders (…/Google, …/Microsoft — used by several apps) are excluded on
	// purpose: removing one would take unrelated apps' data with it.
	b.WriteString(warnStyle.Render("  ※ 번들 ID/이름으로 확실한 항목만 — 여러 앱이 공유하는 벤더 폴더는 안전상 제외") + "\n\n")

	// Reserve rows: 5 header lines above + 1 footer hint = 6.
	listRows := m.height - 6
	if listRows < 1 {
		listRows = 1
	}
	off := m.reviewOff
	if off > len(p.Items)-1 {
		off = max(0, len(p.Items)-1)
	}
	end := off + listRows
	if end > len(p.Items) {
		end = len(p.Items)
	}
	for _, it := range p.Items[off:end] {
		b.WriteString(m.itemLine(it) + "\n")
	}
	if end < len(p.Items) {
		b.WriteString(faintStyle.Render(fmt.Sprintf("  … +%d개 더 (↑/↓ 스크롤)", len(p.Items)-end)) + "\n")
	}
	return m.pad(b.String())
}

// itemLine renders one row of the review list: an icon for its kind, the
// ~-shortened path, its size, and a ⚠ flag when matched only by name.
func (m uninstallModel) itemLine(it leftover) string {
	icon := "🗂 "
	switch {
	case it.IsApp:
		icon = "📦 "
	case it.System:
		icon = "⚙︎ "
	}
	line := "  " + icon + tildePath(it.Path)
	line = clipLine(line, m.width-12)
	line += "  " + faintStyle.Render(humanSize(it.SizeKB))
	if it.ByName {
		line += warnStyle.Render("  ⚠이름매칭")
	}
	if it.System {
		line += faintStyle.Render(" ·관리자")
	}
	return line
}

// Detail is the parent's status line: the spinner, the review prompt, or the
// list-mode key hints.
func (m uninstallModel) Detail() string {
	switch {
	case m.busy:
		return busyStyle.Render(spinner[m.frame%len(spinner)] + " " + m.busyMsg)
	case m.state == uReview:
		return confirmStyle.Render("⚠️  위 항목을 모두 제거합니다.  [y] 휴지통 · [X] 영구삭제 · [n] 취소")
	default:
		return faintStyle.Render("[enter] 선택 앱 분석 · [/] 검색 · [r] 새로고침")
	}
}

func (m uninstallModel) footerHint() string {
	if m.state == uReview {
		return "y 휴지통 · X 영구삭제 · n 취소 · q 종료"
	}
	return "↑/↓ 이동 · / 검색 · enter 분석 · r 새로고침 · q 종료"
}

func (m *uninstallModel) applyColumns() {
	pathW := m.width - nameColW - 6
	if pathW < 10 {
		pathW = 10
	}
	m.table.SetColumns([]table.Column{
		{Title: "APP", Width: nameColW},
		{Title: "PATH", Width: pathW},
	})
}

const nameColW = 28

func (m *uninstallModel) applyFilter() {
	m.shown = filterApps(m.apps, m.filter)
	m.setRows()
}

func filterApps(items []appEntry, q string) []appEntry {
	if q == "" {
		return items
	}
	q = strings.ToLower(q)
	out := make([]appEntry, 0, len(items))
	for _, it := range items {
		if strings.Contains(strings.ToLower(it.Name), q) {
			out = append(out, it)
		}
	}
	return out
}

func (m *uninstallModel) setRows() {
	rows := make([]table.Row, len(m.shown))
	for i, a := range m.shown {
		rows[i] = table.Row{truncate(a.Name, nameColW), tildePath(a.Path)}
	}
	m.table.SetRows(rows)
}

func (m uninstallModel) selectedApp() (appEntry, bool) {
	i := m.table.Cursor()
	if i < 0 || i >= len(m.shown) {
		return appEntry{}, false
	}
	return m.shown[i], true
}

// pad fills s out to the sub-view height so the parent's detail/footer stay
// anchored to the bottom (matching the table views).
func (m uninstallModel) pad(s string) string {
	for rows := strings.Count(s, "\n") + 1; rows < m.height; rows++ {
		s += "\n"
	}
	return s
}

func loadAppsCmd() tea.Cmd {
	return func() tea.Msg {
		apps, err := listApps()
		return appsLoadedMsg{apps: apps, err: err}
	}
}

func scanCmd(app appEntry) tea.Cmd {
	return func() tea.Msg {
		plan, err := scanApp(app)
		return scanDoneMsg{plan: plan, err: err}
	}
}

func removeCmd(plan removalPlan, permanent bool) tea.Cmd {
	label := plan.App.Name + " 휴지통 이동"
	if permanent {
		label = plan.App.Name + " 영구 삭제"
	}
	return func() tea.Msg {
		out, err := performRemoval(plan, permanent)
		return removeDoneMsg{label: label, out: out, err: err}
	}
}

// uTick drives this sub-tab's spinner with its own message type (the 유지보수
// tab uses tickMsg), so a broadcast tick advances only the busy sub-view.
func uTick() tea.Cmd {
	return tea.Tick(120*time.Millisecond, func(time.Time) tea.Msg { return uTickMsg{} })
}

// tildePath replaces the home prefix with ~ for compact display.
func tildePath(p string) string {
	if home, err := os.UserHomeDir(); err == nil && home != "" && strings.HasPrefix(p, home) {
		return "~" + p[len(home):]
	}
	return p
}

// truncate trims s to n cells with an ellipsis (display-width-naive, fine for
// app names / paths).
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

func clipLine(s string, w int) string {
	if w <= 0 {
		return s
	}
	return lipgloss.NewStyle().MaxWidth(w).Render(s)
}
