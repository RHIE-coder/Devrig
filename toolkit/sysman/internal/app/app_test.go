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
	if snap.View != "system" {
		t.Errorf("view = %q, want %q (the device status tab is the default landing tab)", snap.View, "system")
	}
	if snap.UpdatedAt == "" {
		t.Error("updated_at should be set")
	}

	// Switching tabs should update the recorded view too: '2' = Ports, '3' = Processes.
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	data, _ = os.ReadFile(path)
	_ = json.Unmarshal(data, &snap)
	if snap.View != "ports" {
		t.Errorf("after '2' view = %q, want %q", snap.View, "ports")
	}
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	data, _ = os.ReadFile(path)
	_ = json.Unmarshal(data, &snap)
	if snap.View != "processes" {
		t.Errorf("after '3' view = %q, want %q", snap.View, "processes")
	}
}

// TestAgeTimeToggleOnA verifies the AGE⇄STARTED toggle moved from 't' to 'a'
// (so 't' is free for the ancestry overlay).
func TestAgeTimeToggleOnA(t *testing.T) {
	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")}) // Ports table

	if h := m.View(); !strings.Contains(h, "AGE") {
		t.Fatalf("Ports header should show AGE column, got:\n%s", h)
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
		"launchd",  // node name, set above — present regardless of host OS
		"esc/t 닫기", // close hint
	} {
		if !strings.Contains(out, want) {
			t.Errorf("overlay view missing %q in:\n%s", want, out)
		}
	}

	// The orphan marker is a per-OS heuristic (only PID-1 reparenting platforms
	// flag the PPID-1 "starter" node), so assert it only where it applies.
	if process.LikelyOrphan(1, "npm run dev") && !strings.Contains(out, "고아 가능성") {
		t.Errorf("overlay view missing orphan marker %q in:\n%s", "고아 가능성", out)
	}

	// esc closes the overlay.
	var after tea.Model = m
	after, _ = after.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if after.(Model).showTree {
		t.Error("esc should close the ancestry overlay")
	}
}

// TestStatusTabIsDefault verifies the cross-platform device-status tab is the
// landing tab on every OS, is labelled "System" in the tab row, sits on key '1',
// and that its footer replaces the table keys with the status legend.
func TestStatusTabIsDefault(t *testing.T) {
	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 140, Height: 40})

	if got := m.(Model).active; got != viewMetrics {
		t.Fatalf("default active = %d, want viewMetrics (status is the landing tab)", got)
	}
	out := m.View()
	if !strings.Contains(out, "System") {
		t.Error("tab row should label the device-status tab 'System'")
	}
	// The status footer drops the table-only keys (kill/filter/tree).
	if strings.Contains(out, "k kill") {
		t.Error("status footer should not advertise table keys like 'k kill'")
	}

	// '1' returns to it from another tab.
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	if got := m.(Model).active; got != viewMetrics {
		t.Fatalf("after '1' active = %d, want viewMetrics", got)
	}
}

// TestFooterAdvertisesNewKeys locks the footer hint so the rebinds and help stay
// discoverable.
func TestFooterAdvertisesNewKeys(t *testing.T) {
	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 160, Height: 40})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")}) // Ports table legend
	out := m.View()
	for _, want := range []string{"t 족보", "a 시간표시", "h 도움말"} {
		if !strings.Contains(out, want) {
			t.Errorf("footer should advertise %q", want)
		}
	}
}

// TestHelpOverlay verifies 'h' opens the guide (explaining the System-tab terms)
// and esc closes it.
func TestHelpOverlay(t *testing.T) {
	var m tea.Model = New()
	m, _ = m.Update(tea.WindowSizeMsg{Width: 160, Height: 44})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("h")})
	if !m.(Model).showHelp {
		t.Fatal("'h' should open the help overlay")
	}
	out := m.View()
	for _, want := range []string{"도움말", "부하(load)", "SoC", "IOPS"} {
		if !strings.Contains(out, want) {
			t.Errorf("help overlay missing %q", want)
		}
	}
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	if m.(Model).showHelp {
		t.Error("esc should close the help overlay")
	}
}
