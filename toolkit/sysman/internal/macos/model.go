package macos

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// confirmKind tracks a pending confirmation for an impactful action.
type confirmKind int

const (
	confirmNone confirmKind = iota
	confirmRebuild
)

// Model is the System tab: it shows Spotlight/sleep status and runs the two
// maintenance actions. Mutating actions run asynchronously (they pop a macOS
// auth dialog), so the model has a busy state and a spinner while one is in
// flight; input is ignored until it completes.
type Model struct {
	width, height int

	status  Status
	loaded  bool
	readErr error

	busy    bool
	busyMsg string
	confirm confirmKind

	log    string
	logErr bool

	frame int // spinner animation frame, advanced while busy
}

type (
	statusMsg struct {
		st  Status
		err error
	}
	opDoneMsg struct {
		label string
		out   string
		err   error
	}
	tickMsg struct{}
)

// New returns an empty System tab; call Init to load the current status.
func New() Model { return Model{} }

// Init loads the initial Spotlight/sleep status.
func (m Model) Init() tea.Cmd { return loadStatusCmd() }

// SetSize records the body area so the view can pad/clip to it.
func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case statusMsg:
		m.loaded = true
		m.status = msg.st
		m.readErr = msg.err
		return m, nil

	case opDoneMsg:
		m.busy, m.busyMsg = false, ""
		if msg.err != nil {
			detail := firstNonEmpty(collapse(msg.out), msg.err.Error())
			if isCancel(msg.out, msg.err) {
				m.log = fmt.Sprintf("• %s — 취소됨 (관리자 권한 미승인)", msg.label)
				m.logErr = false
			} else {
				m.log = fmt.Sprintf("✗ %s 실패: %s", msg.label, detail)
				m.logErr = true
			}
		} else {
			detail := collapse(msg.out)
			if detail == "" {
				detail = "완료"
			}
			m.log = fmt.Sprintf("✓ %s: %s", msg.label, detail)
			m.logErr = false
		}
		return m, loadStatusCmd() // reflect the new state

	case tickMsg:
		if m.busy {
			m.frame++
			return m, tick()
		}
		return m, nil

	case tea.KeyMsg:
		return m.updateKey(msg)
	}
	return m, nil
}

func (m Model) updateKey(key tea.KeyMsg) (Model, tea.Cmd) {
	if m.busy {
		return m, nil // a privileged op is running; ignore input until it returns
	}

	if m.confirm == confirmRebuild {
		switch key.String() {
		case "y", "Y", "enter":
			m.confirm = confirmNone
			return m.start(rebuildCmd())
		case "n", "N", "esc":
			m.confirm = confirmNone
			m.log, m.logErr = "취소했습니다.", false
		}
		return m, nil
	}

	switch key.String() {
	case "r":
		return m, loadStatusCmd()
	case "e":
		m.confirm = confirmRebuild
	case "s":
		return m.start(setSleepCmd(!m.status.SleepDisabled))
	}
	return m, nil
}

// start enters the busy state for an admin action and kicks off its command
// (which carries its own label) alongside the spinner ticker.
func (m Model) start(cmd tea.Cmd) (Model, tea.Cmd) {
	m.busy = true
	m.busyMsg = "관리자 권한 요청 중… (시스템 대화상자를 확인하세요)"
	m.log = ""
	return m, tea.Batch(cmd, tick())
}

func (m Model) View() string {
	var b strings.Builder
	b.WriteString(headerStyle.Render(" macOS 시스템 유틸리티 "))
	b.WriteString("\n\n")

	// — Spotlight —
	b.WriteString(sectionStyle.Render("Spotlight 색인"))
	b.WriteString("\n")
	switch {
	case !m.loaded:
		b.WriteString(faintStyle.Render("  상태 읽는 중…") + "\n")
	case m.readErr != nil:
		b.WriteString(errStyle.Render("  상태 확인 실패: "+m.readErr.Error()) + "\n")
	default:
		b.WriteString("  현재: " + onOff(m.status.SpotlightHealthy, "정상 (모든 볼륨 색인 사용)", "손상/점검 필요") + "\n")
		for _, ln := range m.status.SpotlightLines {
			b.WriteString(faintStyle.Render(m.clip("    "+ln)) + "\n")
		}
		if !m.status.SpotlightHealthy {
			b.WriteString(warnStyle.Render(m.wrap("  ⚠ Data 볼륨이 unknown/invalid면 mdutil로는 재색인이 안 됩니다 → 재부팅(부팅 시 자동 재구성) 또는 시스템 설정 > Spotlight 개인정보 보호에서 디스크 추가→제거")) + "\n")
		}
	}
	b.WriteString(keyStyle.Render("  [e]") + descStyle.Render(" 색인 재구성 (mdutil -E /) — 관리자 권한 필요, 재색인에 수 분") + "\n")

	// — Sleep —
	b.WriteString("\n")
	b.WriteString(sectionStyle.Render("잠자기 방지 (pmset disablesleep)"))
	b.WriteString("\n")
	switch {
	case !m.loaded:
		b.WriteString(faintStyle.Render("  상태 읽는 중…") + "\n")
	case !m.status.SleepKnown:
		b.WriteString("  현재: " + faintStyle.Render("설정 없음 (기본 OFF)") + "\n")
	default:
		b.WriteString("  현재: " + onOff(m.status.SleepDisabled, "ON  (disablesleep 1 · 잠자기 안 함)", "OFF (disablesleep 0 · 정상)") + "\n")
	}
	b.WriteString(keyStyle.Render("  [s]") + descStyle.Render(" ON/OFF 토글 — 관리자 권한 필요") + "\n")

	// — Result log — wrapped (not clipped) so a long command error stays fully
	// readable instead of being cut off at the screen edge.
	if m.log != "" {
		b.WriteString("\n")
		style := okStyle
		if m.logErr {
			style = errStyle
		}
		b.WriteString(style.Render(m.wrap("» " + m.log)))
		b.WriteString("\n")
	}

	out := b.String()
	for rows := strings.Count(out, "\n") + 1; rows < m.height; rows++ {
		out += "\n"
	}
	return out
}

// Detail is the line the parent shell renders under the body: the pending
// confirm prompt, the busy spinner, or the key hint.
func (m Model) Detail() string {
	switch {
	case m.busy:
		return busyStyle.Render(spinner[m.frame%len(spinner)] + " " + m.busyMsg)
	case m.confirm == confirmRebuild:
		return confirmStyle.Render("⚠️  Spotlight 색인을 지우고 다시 만듭니다. 진행할까요?  [y] 예 · [n] 아니오")
	default:
		return faintStyle.Render("[e] Spotlight 재색인 · [s] 잠자기방지 토글 · [r] 새로고침")
	}
}

func (m Model) clip(s string) string {
	if m.width <= 0 {
		return s
	}
	return lipgloss.NewStyle().MaxWidth(m.width).Render(s)
}

// wrap soft-wraps s to the body width so long lines (e.g. a command error) span
// multiple rows instead of being truncated.
func (m Model) wrap(s string) string {
	if m.width <= 0 {
		return s
	}
	return lipgloss.NewStyle().Width(m.width).Render(s)
}

func loadStatusCmd() tea.Cmd {
	return func() tea.Msg {
		st, err := readStatus()
		return statusMsg{st: st, err: err}
	}
}

func rebuildCmd() tea.Cmd {
	return func() tea.Msg {
		out, err := rebuildSpotlight()
		return opDoneMsg{label: "Spotlight 색인 재구성", out: out, err: err}
	}
}

func setSleepCmd(on bool) tea.Cmd {
	label := "잠자기 방지 끄기"
	if on {
		label = "잠자기 방지 켜기"
	}
	return func() tea.Msg {
		out, err := setDisableSleep(on)
		return opDoneMsg{label: label, out: out, err: err}
	}
}

func tick() tea.Cmd {
	return tea.Tick(120*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} })
}

func onOff(b bool, on, off string) string {
	if b {
		return onStyle.Render(on)
	}
	return offStyle.Render(off)
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// isCancel reports whether a failed admin command was the user dismissing the
// authentication dialog rather than a real error.
func isCancel(out string, err error) bool {
	hay := out
	if err != nil {
		hay += " " + err.Error()
	}
	return strings.Contains(hay, "-128") || strings.Contains(strings.ToLower(hay), "cancel")
}

var spinner = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

var (
	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("57"))

	sectionStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("75"))

	keyStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("213"))

	descStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("250"))

	faintStyle = lipgloss.NewStyle().
			Faint(true).
			Foreground(lipgloss.Color("240"))

	onStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("78"))

	offStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("214"))

	okStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("78"))

	errStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("196"))

	warnStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))

	busyStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("214"))

	confirmStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("203"))
)
