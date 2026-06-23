// Bubble Tea picker for builder's interactive mode, styled to match the DevRig
// gateway menu. It only collects a selection — recipe, verb, and (for `add`) a
// target — and returns it as a plan; the actual work runs after the TUI exits,
// on the restored terminal, mirroring how the gateway hands off to a tool.
package main

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type screen int

const (
	pickRecipe screen = iota // browsing the recipe list
	pickVerb                 // choosing get/add/new for the selected recipe
	inputTarget              // typing the destination for `add`
)

// plan is the selection produced by the picker, executed after it exits.
type plan struct {
	recipe *Recipe
	verb   string
	target string
}

type pickerModel struct {
	recipes []*Recipe
	screen  screen

	rCursor int      // recipe cursor
	verbs   []string // verbs for the chosen recipe
	vCursor int      // verb cursor
	target  string   // target buffer (inputTarget)

	plan *plan // set on completion; nil = cancelled
}

func (m pickerModel) Init() tea.Cmd { return nil }

func (m pickerModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	key, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}
	if key.String() == "ctrl+c" {
		return m, tea.Quit
	}
	switch m.screen {
	case pickRecipe:
		return m.updatePickRecipe(key)
	case pickVerb:
		return m.updatePickVerb(key)
	case inputTarget:
		return m.updateInputTarget(key)
	}
	return m, nil
}

func (m pickerModel) updatePickRecipe(key tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch key.String() {
	case "q", "esc":
		return m, tea.Quit
	case "up", "k":
		if m.rCursor > 0 {
			m.rCursor--
		}
	case "down", "j":
		if m.rCursor < len(m.recipes)-1 {
			m.rCursor++
		}
	case "enter":
		m.verbs = m.recipes[m.rCursor].verbList()
		m.vCursor = 0
		m.screen = pickVerb
	}
	return m, nil
}

func (m pickerModel) updatePickVerb(key tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch key.String() {
	case "q":
		return m, tea.Quit
	case "esc":
		m.screen = pickRecipe
	case "up", "k":
		if m.vCursor > 0 {
			m.vCursor--
		}
	case "down", "j":
		if m.vCursor < len(m.verbs)-1 {
			m.vCursor++
		}
	case "enter":
		r := m.recipes[m.rCursor]
		switch m.verbs[m.vCursor] {
		case "add":
			m.target = r.Target // prefill default, editable
			m.screen = inputTarget
		default: // get, new — no further input needed
			m.plan = &plan{recipe: r, verb: m.verbs[m.vCursor]}
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m pickerModel) updateInputTarget(key tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch key.String() {
	case "esc":
		m.screen = pickVerb
	case "enter":
		r := m.recipes[m.rCursor]
		target := strings.TrimSpace(m.target)
		if target == "" {
			target = r.Target
		}
		m.plan = &plan{recipe: r, verb: "add", target: target}
		return m, tea.Quit
	case "backspace":
		if runes := []rune(m.target); len(runes) > 0 {
			m.target = string(runes[:len(runes)-1])
		}
	case "space":
		m.target += " "
	default:
		if key.Type == tea.KeyRunes {
			m.target += string(key.Runes)
		}
	}
	return m, nil
}

func (m pickerModel) View() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("DevRig forge"))
	b.WriteString("\n\n")

	switch m.screen {
	case pickRecipe:
		lastDomain := ""
		for i, r := range m.recipes {
			if r.Domain != lastDomain {
				b.WriteString(helpStyle.Render("  "+r.Domain+"/") + "\n")
				lastDomain = r.Domain
			}
			b.WriteString("  " + row(i == m.rCursor, fmt.Sprintf("%-20s %s", r.Name, r.About)))
		}
		b.WriteString("\n")
		b.WriteString(helpStyle.Render("↑/↓ 이동 · enter 선택 · q 종료"))

	case pickVerb:
		r := m.recipes[m.rCursor]
		b.WriteString(itemStyle.Render("레시피  ") + selectedStyle.Render(r.Name) + "\n\n")
		for i, v := range m.verbs {
			b.WriteString(row(i == m.vCursor, fmt.Sprintf("%-5s %s", v, verbDesc(v))))
		}
		b.WriteString("\n")
		b.WriteString(helpStyle.Render("↑/↓ 이동 · enter 선택 · esc 뒤로 · q 종료"))

	case inputTarget:
		r := m.recipes[m.rCursor]
		b.WriteString(itemStyle.Render(r.Name+" 를 설치할 위치") + "\n\n")
		b.WriteString("  " + selectedStyle.Render(m.target+"▏") + "\n\n")
		b.WriteString(helpStyle.Render("입력 후 enter · esc 뒤로 · 기본값 " + r.Target))
	}

	b.WriteString("\n")
	return b.String()
}

// row renders one selectable line with the shared cursor marker/highlight.
func row(selected bool, text string) string {
	if selected {
		return "▸ " + selectedStyle.Render(text) + "\n"
	}
	return "  " + itemStyle.Render(text) + "\n"
}

// runPicker shows the picker and returns the chosen plan, or nil if cancelled.
func runPicker(recipes []*Recipe) (*plan, error) {
	res, err := tea.NewProgram(pickerModel{recipes: recipes}, tea.WithAltScreen()).Run()
	if err != nil {
		return nil, err
	}
	if final, ok := res.(pickerModel); ok {
		return final.plan, nil
	}
	return nil, nil
}

// Styles mirror the gateway menu (toolkit/internal/menu) so the two pickers feel
// like one product.
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("63")).
			Padding(0, 1)

	itemStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
	selectedStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("213"))
	helpStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("241"))
)
