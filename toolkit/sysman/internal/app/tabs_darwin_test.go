//go:build darwin

package app

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// TestSystemTabReachable verifies the macOS-only System tab is registered and
// switchable via '3', and that its footer/legend replaces the table keys.
func TestSystemTabReachable(t *testing.T) {
	if !systemTabEnabled {
		t.Fatal("systemTabEnabled should be true on darwin")
	}

	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 140, Height: 40})

	out := m.View()
	if !strings.Contains(out, "System") {
		t.Error("tab row should list the System tab on macOS")
	}

	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	if got := m.(Model).active; got != viewSystem {
		t.Fatalf("after '3' active = %d, want viewSystem", got)
	}
	out = m.View()
	if !strings.Contains(out, "macOS 시스템 유틸리티") {
		t.Error("System tab body should render its header")
	}
	if !strings.Contains(out, "Spotlight 재색인") {
		t.Error("footer should show System-tab actions when that tab is active")
	}
}
