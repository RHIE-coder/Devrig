package macos

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func key(s string) tea.KeyMsg {
	if s == "enter" {
		return tea.KeyMsg{Type: tea.KeyEnter}
	}
	return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(s)}
}

// TestRebuildNeedsConfirm verifies the destructive action is gated: 'e' arms a
// confirmation (no command runs yet), and only 'y' enters the busy state and
// dispatches work. None of the returned commands are executed, so no real
// system command is invoked by this test.
func TestRebuildNeedsConfirm(t *testing.T) {
	m := New()
	m.SetSize(80, 20)
	m, _ = m.Update(statusMsg{st: Status{SpotlightHealthy: false}})

	m, cmd := m.Update(key("e"))
	if m.confirm != confirmRebuild {
		t.Fatalf("after 'e' confirm = %v, want confirmRebuild", m.confirm)
	}
	if cmd != nil {
		t.Error("'e' must only arm confirmation, not run anything")
	}
	if !strings.Contains(m.Detail(), "진행할까요") {
		t.Errorf("detail should show the confirm prompt, got %q", m.Detail())
	}

	// 'n' cancels without running.
	cancelled, _ := m.Update(key("n"))
	if cancelled.confirm != confirmNone || cancelled.busy {
		t.Error("'n' should cancel the confirmation and not go busy")
	}

	// 'y' confirms: busy + a command dispatched.
	confirmed, runCmd := m.Update(key("y"))
	if !confirmed.busy {
		t.Error("'y' should enter the busy state")
	}
	if runCmd == nil {
		t.Error("'y' should dispatch the rebuild command")
	}
}

// TestSleepToggleGoesBusy verifies 's' starts an (admin) toggle without a
// separate confirm, and that input is ignored while busy.
func TestSleepToggleGoesBusy(t *testing.T) {
	m := New()
	m.SetSize(80, 20)
	m, _ = m.Update(statusMsg{st: Status{SleepKnown: true, SleepDisabled: false}})

	busy, cmd := m.Update(key("s"))
	if !busy.busy || cmd == nil {
		t.Fatal("'s' should go busy and dispatch a command")
	}
	// While busy, further keys are ignored (no new command, still busy).
	again, cmd2 := busy.Update(key("e"))
	if cmd2 != nil || again.confirm != confirmNone {
		t.Error("keys must be ignored while a privileged op is running")
	}
}

// TestViewRendersStates ensures the body renders without panic across states.
func TestViewRendersStates(t *testing.T) {
	m := New()
	m.SetSize(100, 24)
	if !strings.Contains(m.View(), "상태 읽는 중") {
		t.Error("unloaded view should show a loading hint")
	}
	m, _ = m.Update(statusMsg{st: Status{
		SpotlightHealthy: false,
		SpotlightLines:   []string{"/System/Volumes/Data — Error: unknown indexing state."},
		SleepKnown:       true,
	}})
	out := m.View()
	for _, want := range []string{"Spotlight 색인", "손상 감지", "잠자기 방지", "[e]", "[s]"} {
		if !strings.Contains(out, want) {
			t.Errorf("loaded view missing %q in:\n%s", want, out)
		}
	}
}
