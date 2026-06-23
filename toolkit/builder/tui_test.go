package main

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// drive feeds a sequence of key messages through the model and returns the final
// state, exercising the picker's transitions without a real terminal.
func drive(start pickerModel, keys ...tea.KeyMsg) pickerModel {
	var m tea.Model = start
	for _, k := range keys {
		m, _ = m.Update(k)
	}
	return m.(pickerModel)
}

func runes(s string) []tea.KeyMsg {
	out := make([]tea.KeyMsg, 0, len(s))
	for _, r := range s {
		out = append(out, tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
	}
	return out
}

func sample() pickerModel {
	return pickerModel{recipes: []*Recipe{
		{Name: "claude-statusline", Domain: "claude", About: "x", Dest: "inplace", Target: "~/.claude"},
		{Name: "react-ws", Domain: "react", About: "y", Dest: "new"},
	}}
}

func TestPickerGetFlow(t *testing.T) {
	// recipe 0 (default), enter -> verbs [get,add], enter on "get".
	m := drive(sample(), tea.KeyMsg{Type: tea.KeyEnter}, tea.KeyMsg{Type: tea.KeyEnter})
	if m.plan == nil || m.plan.verb != "get" || m.plan.recipe.Name != "claude-statusline" {
		t.Fatalf("get flow: unexpected plan %+v", m.plan)
	}
}

func TestPickerAddFlowWithTypedTarget(t *testing.T) {
	keys := []tea.KeyMsg{
		{Type: tea.KeyEnter},     // select recipe 0 -> pickVerb
		{Type: tea.KeyDown},      // move to "add"
		{Type: tea.KeyEnter},     // -> inputTarget (prefilled ~/.claude)
	}
	// clear the 9-rune prefill, then type a fresh path.
	for range len("~/.claude") {
		keys = append(keys, tea.KeyMsg{Type: tea.KeyBackspace})
	}
	keys = append(keys, runes("/tmp/x")...)
	keys = append(keys, tea.KeyMsg{Type: tea.KeyEnter})

	m := drive(sample(), keys...)
	if m.plan == nil || m.plan.verb != "add" || m.plan.target != "/tmp/x" {
		t.Fatalf("add flow: unexpected plan %+v", m.plan)
	}
}

func TestPickerAddEmptyTargetFallsBackToDefault(t *testing.T) {
	// enter -> down(add) -> enter -> (leave prefill) enter.
	m := drive(sample(),
		tea.KeyMsg{Type: tea.KeyEnter},
		tea.KeyMsg{Type: tea.KeyDown},
		tea.KeyMsg{Type: tea.KeyEnter},
		tea.KeyMsg{Type: tea.KeyEnter},
	)
	if m.plan == nil || m.plan.target != "~/.claude" {
		t.Fatalf("add default: unexpected plan %+v", m.plan)
	}
}

func TestPickerProjectRecipeOnlyOffersNew(t *testing.T) {
	// move to recipe 1 (react-ws, dest:new) -> verbs should be ["new"].
	m := drive(sample(), tea.KeyMsg{Type: tea.KeyDown}, tea.KeyMsg{Type: tea.KeyEnter})
	if len(m.verbs) != 1 || m.verbs[0] != "new" {
		t.Fatalf("project recipe verbs: got %v", m.verbs)
	}
}

func TestViewRendersAllScreens(t *testing.T) {
	// pickRecipe
	if got := sample().View(); !strings.Contains(got, "DevRig forge") {
		t.Fatalf("pickRecipe view missing title: %q", got)
	}
	// pickVerb
	verb := drive(sample(), tea.KeyMsg{Type: tea.KeyEnter})
	if got := verb.View(); !strings.Contains(got, "claude-statusline") {
		t.Fatalf("pickVerb view missing recipe: %q", got)
	}
	// inputTarget
	target := drive(sample(),
		tea.KeyMsg{Type: tea.KeyEnter},
		tea.KeyMsg{Type: tea.KeyDown},
		tea.KeyMsg{Type: tea.KeyEnter},
	)
	if got := target.View(); !strings.Contains(got, "설치할 위치") {
		t.Fatalf("inputTarget view missing prompt: %q", got)
	}
}

func TestPickerCancel(t *testing.T) {
	m := drive(sample(), tea.KeyMsg{Type: tea.KeyEsc})
	if m.plan != nil {
		t.Fatalf("cancel: expected nil plan, got %+v", m.plan)
	}
}

func TestPickerBackNavigation(t *testing.T) {
	// into verbs, esc back to recipes, no plan committed.
	m := drive(sample(),
		tea.KeyMsg{Type: tea.KeyEnter},
		tea.KeyMsg{Type: tea.KeyEsc},
	)
	if m.screen != pickRecipe || m.plan != nil {
		t.Fatalf("back nav: screen=%v plan=%+v", m.screen, m.plan)
	}
}
