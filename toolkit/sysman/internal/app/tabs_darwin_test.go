//go:build darwin

package app

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// TestMaintenanceTabReachable verifies the macOS-only maintenance tab is
// registered and switchable via '4', is labelled "Maintenance (macOS)" so it no
// longer overlaps with the device "System" tab, and that its footer/legend
// replaces the table keys.
func TestMaintenanceTabReachable(t *testing.T) {
	if !systemTabEnabled {
		t.Fatal("systemTabEnabled should be true on darwin")
	}

	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 160, Height: 40})

	out := m.View()
	if !strings.Contains(out, "Maintenance (macOS)") {
		t.Error("tab row should label the macOS maintenance tab 'Maintenance (macOS)'")
	}

	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("4")})
	if got := m.(Model).active; got != viewSystem {
		t.Fatalf("after '4' active = %d, want viewSystem (maintenance)", got)
	}
	out = m.View()
	if !strings.Contains(out, "macOS 시스템 유틸리티") {
		t.Error("System tab body should render its header")
	}
	if !strings.Contains(out, "Spotlight 재색인") {
		t.Error("footer should show System-tab actions when that tab is active")
	}
}
