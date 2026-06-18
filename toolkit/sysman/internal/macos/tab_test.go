package macos

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func arrow(t tea.KeyType) tea.KeyMsg { return tea.KeyMsg{Type: t} }

// TestSubTabSwitching verifies ←/→ flips between the 유지보수 and 앱 제거 sub-tabs
// and that the first switch to 앱 제거 lazily kicks off the app-list load.
func TestSubTabSwitching(t *testing.T) {
	m := New()
	m.SetSize(100, 24)
	if m.sub != subMaint {
		t.Fatal("should start on the 유지보수 sub-tab")
	}

	m, cmd := m.Update(arrow(tea.KeyRight))
	if m.sub != subUninstall {
		t.Fatalf("→ should move to 앱 제거, got %v", m.sub)
	}
	if cmd == nil {
		t.Error("first switch to 앱 제거 should lazily launch the app-list load")
	}
	if !m.uninstLoaded {
		t.Error("uninstLoaded should latch true after the first visit")
	}

	// Switching back and forth again must NOT re-launch the load.
	m, _ = m.Update(arrow(tea.KeyLeft))
	if m.sub != subMaint {
		t.Fatalf("← should return to 유지보수, got %v", m.sub)
	}
	if _, cmd = m.Update(arrow(tea.KeyRight)); cmd != nil {
		t.Error("re-entering 앱 제거 must not reload (already loaded)")
	}
}

// TestSubBarAndDelegation checks the sub-tab strip renders both labels and that
// View/Detail/FooterHint follow the active sub-tab.
func TestSubBarAndDelegation(t *testing.T) {
	m := New()
	m.SetSize(100, 24)

	bar := m.subBar()
	for _, want := range []string{"유지보수", "앱 제거", "←/→"} {
		if !strings.Contains(bar, want) {
			t.Errorf("sub-tab strip missing %q", want)
		}
	}
	if !strings.Contains(m.FooterHint(), "Spotlight") {
		t.Error("유지보수 footer should mention Spotlight")
	}

	m, _ = m.Update(arrow(tea.KeyRight)) // → 앱 제거
	if !strings.Contains(m.FooterHint(), "분석") {
		t.Error("앱 제거 footer should mention 분석")
	}
	if strings.Contains(m.View(), "panic") { // smoke: must render without error
		t.Error("unexpected content")
	}
}
