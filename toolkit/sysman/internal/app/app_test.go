package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// TestPublishesFocusOnNavigation verifies the wiring that backs the
// "let Claude see what I'm looking at" feature: navigating the TUI writes the
// current screen (view, focus, …) to the state file. No TTY/data is required —
// Update is a pure function we can drive with synthetic messages.
func TestPublishesFocusOnNavigation(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_STATE_HOME", dir)

	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyDown}) // navigation -> publishFocus

	path := filepath.Join(dir, "devrig", "sysman.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("state file not written on navigation: %v", err)
	}

	var snap struct {
		UpdatedAt string `json:"updated_at"`
		View      string `json:"view"`
	}
	if err := json.Unmarshal(data, &snap); err != nil {
		t.Fatalf("state file is not valid JSON: %v", err)
	}
	if snap.View != "ports" {
		t.Errorf("view = %q, want %q (Ports is the default tab)", snap.View, "ports")
	}
	if snap.UpdatedAt == "" {
		t.Error("updated_at should be set")
	}

	// Switching tabs should update the recorded view too.
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	data, _ = os.ReadFile(path)
	_ = json.Unmarshal(data, &snap)
	if snap.View != "processes" {
		t.Errorf("after tab switch view = %q, want %q", snap.View, "processes")
	}
}
