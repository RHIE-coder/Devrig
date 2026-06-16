package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/process"
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

// TestAgeTimeToggleOnA verifies the AGE⇄STARTED toggle moved from 't' to 'a'
// (so 't' is free for the ancestry overlay).
func TestAgeTimeToggleOnA(t *testing.T) {
	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})

	if h := m.View(); !strings.Contains(h, "AGE") {
		t.Fatalf("default header should show AGE column, got:\n%s", h)
	}
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("a")})
	if h := m.View(); !strings.Contains(h, "STARTED") {
		t.Errorf("after 'a' the AGE column should switch to STARTED, got:\n%s", h)
	}
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("a")})
	if h := m.View(); !strings.Contains(h, "AGE") {
		t.Errorf("'a' should toggle back to AGE, got:\n%s", h)
	}
}

// TestAncestryOverlay verifies the 't' overlay renders the parent chain with
// each node's launch command and the orphan marker, and that esc closes it.
func TestAncestryOverlay(t *testing.T) {
	var tm tea.Model = New()
	tm, _ = tm.Update(tea.WindowSizeMsg{Width: 120, Height: 40})

	m := tm.(Model)
	m.showTree = true
	m.treePID = 42
	m.treeChain = []process.Process{
		{PID: 42, PPID: 7, Name: "child", Cmdline: "./child --serve"},
		{PID: 7, PPID: 1, Name: "starter", Cmdline: "npm run dev"},
		{PID: 1, PPID: 0, Name: "launchd"},
	}

	out := m.View()
	for _, want := range []string{
		"Ancestry of PID 42", // overlay title
		"child",
		"./child --serve", // launch command shown in the tree
		"npm run dev",
		"launchd",
		"고아 가능성",   // starter (PPID 1, user process) flagged as a likely orphan
		"esc/t 닫기", // close hint
	} {
		if !strings.Contains(out, want) {
			t.Errorf("overlay view missing %q in:\n%s", want, out)
		}
	}

	// esc closes the overlay.
	var after tea.Model = m
	after, _ = after.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if after.(Model).showTree {
		t.Error("esc should close the ancestry overlay")
	}
}

// TestFooterAdvertisesNewKeys locks the footer hint so the rebind stays
// discoverable.
func TestFooterAdvertisesNewKeys(t *testing.T) {
	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 160, Height: 40})
	out := m.View()
	if !strings.Contains(out, "t tree") {
		t.Error("footer should advertise 't tree'")
	}
	if !strings.Contains(out, "a age") {
		t.Error("footer should advertise 'a age⇄time'")
	}
}
