package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteAndPath(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_STATE_HOME", dir)

	want := filepath.Join(dir, "devrig", "sysman.json")
	if got := Path(); got != want {
		t.Fatalf("Path() = %q, want %q", got, want)
	}

	type focus struct {
		Port int    `json:"port"`
		Proc string `json:"process"`
	}
	Write(Snapshot{
		View:    "ports",
		Filter:  "node",
		Focused: focus{Port: 3000, Proc: "node"},
		Visible: []focus{{Port: 3000, Proc: "node"}},
	})

	data, err := os.ReadFile(want)
	if err != nil {
		t.Fatalf("state file not written: %v", err)
	}

	// Owner-only file permissions.
	if info, err := os.Stat(want); err == nil {
		if perm := info.Mode().Perm(); perm != 0o600 {
			t.Errorf("file perm = %o, want 600", perm)
		}
	}

	var snap struct {
		UpdatedAt string  `json:"updated_at"`
		View      string  `json:"view"`
		Filter    string  `json:"filter"`
		Focused   focus   `json:"focused"`
		Visible   []focus `json:"visible"`
	}
	if err := json.Unmarshal(data, &snap); err != nil {
		t.Fatalf("state file is not valid JSON: %v", err)
	}
	if snap.View != "ports" || snap.Filter != "node" || snap.Focused.Port != 3000 {
		t.Errorf("round-trip mismatch: %+v", snap)
	}
	if len(snap.Visible) != 1 || snap.Visible[0].Port != 3000 {
		t.Errorf("visible mismatch: %+v", snap.Visible)
	}
	if snap.UpdatedAt == "" {
		t.Error("updated_at should be set")
	}
}

func TestPathFallsBackToTempDir(t *testing.T) {
	t.Setenv("XDG_STATE_HOME", "") // unset → per-user temp dir

	want := filepath.Join(os.TempDir(), "devrig", "sysman.json")
	if got := Path(); got != want {
		t.Errorf("Path() = %q, want %q (should fall back to os.TempDir)", got, want)
	}
}

func TestClear(t *testing.T) {
	t.Setenv("XDG_STATE_HOME", t.TempDir())

	Write(Snapshot{View: "ports"})
	if _, err := os.Stat(Path()); err != nil {
		t.Fatalf("precondition: file should exist: %v", err)
	}

	Clear()
	if _, err := os.Stat(Path()); !os.IsNotExist(err) {
		t.Errorf("after Clear, file should be gone, stat err = %v", err)
	}
}
