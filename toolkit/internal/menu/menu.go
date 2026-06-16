// Package menu provides the interactive tool picker shown when `toolkit` is run
// with no arguments. It is a small Bubble Tea program that, on selection, builds
// the tool behind a loading screen and then hands the terminal straight to it
// via tea.ExecProcess — so the user never sees the bare terminal (or a build
// scrolling by) between picking a tool and its full-screen UI appearing.
package menu

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/rhie-coder/devrig/toolkit/internal/manifest"
)

// Launch builds (if needed) and resolves a chosen tool to a ready-to-run
// command. It is supplied by the caller so this package carries no build logic;
// it runs while the picker shows a loading screen, keeping the slow part
// (compiling a Go tool) behind the alt-screen instead of on the bare terminal.
type Launch func(name string) (*exec.Cmd, error)

type stage int

const (
	choosing stage = iota // browsing the list
	preparing             // building the selected tool behind a loading screen
	failed                // build/launch failed; showing the error
)

type model struct {
	tools  []*manifest.Manifest
	launch Launch
	cursor int
	stage  stage
	choice string // selected tool name, set on Enter
	frame  int    // spinner animation frame
	err    error  // prepare/exec error, surfaced to the caller
}

type (
	preparedMsg struct {
		cmd *exec.Cmd
		err error
	}
	execDoneMsg struct{ err error }
	tickMsg     struct{}
)

func (m model) Init() tea.Cmd { return nil }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			return m, tea.Quit
		}
		switch m.stage {
		case choosing:
			return m.updateChoosing(msg)
		case failed:
			switch msg.String() {
			case "q", "esc", "enter":
				return m, tea.Quit
			}
		}
		// preparing: ignore keystrokes (ctrl+c handled above).

	case tickMsg:
		if m.stage == preparing {
			m.frame++
			return m, tick()
		}

	case preparedMsg:
		if msg.err != nil {
			m.stage = failed
			m.err = msg.err
			return m, nil
		}
		// Hand the terminal to the tool. ExecProcess pauses this program for the
		// run; because the binary is already built, the tool's full-screen UI
		// comes up immediately — no build step visible on the bare terminal.
		return m, tea.ExecProcess(msg.cmd, func(err error) tea.Msg {
			return execDoneMsg{err}
		})

	case execDoneMsg:
		m.err = msg.err
		return m, tea.Quit
	}
	return m, nil
}

func (m model) updateChoosing(key tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch key.String() {
	case "q", "esc":
		return m, tea.Quit
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < len(m.tools)-1 {
			m.cursor++
		}
	case "enter":
		m.stage = preparing
		m.choice = m.tools[m.cursor].Name
		return m, tea.Batch(prepareCmd(m.launch, m.choice), tick())
	}
	return m, nil
}

func (m model) View() string {
	switch m.stage {
	case preparing:
		return m.loadingView()
	case failed:
		return m.errorView()
	default:
		return m.listView()
	}
}

func (m model) listView() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("DevRig toolkit"))
	b.WriteString("\n\n")

	for i, t := range m.tools {
		marker := "  "
		line := fmt.Sprintf("%-12s %s", t.Name, t.Description)
		if i == m.cursor {
			marker = "▸ "
			line = selectedStyle.Render(line)
		} else {
			line = itemStyle.Render(line)
		}
		b.WriteString(marker + line + "\n")
	}

	b.WriteString("\n")
	b.WriteString(helpStyle.Render("↑/↓ 이동 · enter 실행 · q 종료"))
	b.WriteString("\n")
	return b.String()
}

func (m model) loadingView() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("DevRig toolkit"))
	b.WriteString("\n\n")
	sp := spinnerFrames[m.frame%len(spinnerFrames)]
	b.WriteString(selectedStyle.Render(fmt.Sprintf("%s  %s 실행 준비 중…", sp, m.choice)))
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("처음 실행이면 빌드 중입니다 — 잠시만요"))
	b.WriteString("\n")
	return b.String()
}

func (m model) errorView() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("DevRig toolkit"))
	b.WriteString("\n\n")
	b.WriteString(errStyle.Render(fmt.Sprintf("✗ %s 실행 실패: %v", m.choice, m.err)))
	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("q 종료"))
	b.WriteString("\n")
	return b.String()
}

func prepareCmd(launch Launch, name string) tea.Cmd {
	return func() tea.Msg {
		cmd, err := launch(name)
		return preparedMsg{cmd: cmd, err: err}
	}
}

func tick() tea.Cmd {
	return tea.Tick(80*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} })
}

// Select shows the picker and, on selection, builds and launches the chosen
// tool in place (handing over the terminal). It returns once the launched tool
// exits, or nil if the user quit without choosing.
func Select(tools []*manifest.Manifest, launch Launch) error {
	res, err := tea.NewProgram(model{tools: tools, launch: launch}, tea.WithAltScreen()).Run()
	if err != nil {
		return err
	}
	if final, ok := res.(model); ok {
		return final.err
	}
	return nil
}

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("63")).
			Padding(0, 1)

	itemStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))

	selectedStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))

	helpStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))

	errStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("196"))
)
