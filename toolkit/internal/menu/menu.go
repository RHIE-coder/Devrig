// Package menu provides the interactive tool picker shown when `toolkit` is run
// with no arguments. It is a small Bubble Tea program that returns the chosen
// tool's name; the caller then launches it, handing over the terminal.
package menu

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/rhie-coder/devrig/toolkit/internal/manifest"
)

type model struct {
	tools  []*manifest.Manifest
	cursor int
	choice string // selected tool name, set on Enter
}

func (m model) Init() tea.Cmd { return nil }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	key, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}
	switch key.String() {
	case "ctrl+c", "q", "esc":
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
		m.choice = m.tools[m.cursor].Name
		return m, tea.Quit
	}
	return m, nil
}

func (m model) View() string {
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

// Select shows the picker and returns the chosen tool name, or "" if the user
// quit without choosing.
func Select(tools []*manifest.Manifest) (string, error) {
	res, err := tea.NewProgram(model{tools: tools}, tea.WithAltScreen()).Run()
	if err != nil {
		return "", err
	}
	final, ok := res.(model)
	if !ok {
		return "", nil
	}
	return final.choice, nil
}

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("63")).
			Padding(0, 1)

	itemStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))

	selectedStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))

	helpStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
)
