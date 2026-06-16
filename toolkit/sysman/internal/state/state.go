// Package state persists what the running sysman TUI is currently showing and
// focusing to a small JSON file, so external tools (Claude, Codex, scripts) can
// answer questions like "what is the process I'm pointing at?" based on the
// live screen — not a fresh, independent scan.
//
// The data is ephemeral ("what I'm pointing at right now"), so it lives in the
// per-user temp dir (macOS: the private $TMPDIR) and is removed when the UI
// exits. Writes are best-effort: failures never disrupt the UI.
package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Snapshot mirrors what is on screen in the TUI right now.
type Snapshot struct {
	UpdatedAt string `json:"updated_at"`        // when this was written
	View      string `json:"view"`              // active tab: "ports" | "processes"
	Filter    string `json:"filter,omitempty"`  // active filter query, if any
	Focused   any    `json:"focused"`           // the highlighted row (or null)
	Visible   any    `json:"visible,omitempty"` // rows currently listed (filtered)
}

// Path returns the state file location. It honors $XDG_STATE_HOME when set
// (explicit user config); otherwise it uses the per-user temp directory
// (os.TempDir → $TMPDIR on macOS, which is private to the user).
func Path() string {
	base := os.Getenv("XDG_STATE_HOME")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "devrig", "sysman.json")
}

// Write records the current screen snapshot. The directory and file are created
// owner-only (0700/0600) so other local users can't read it even under a shared
// /tmp. The timestamp is stamped here. Errors are swallowed.
func Write(s Snapshot) {
	p := Path()
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return
	}
	s.UpdatedAt = time.Now().Format(time.RFC3339)
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(p, data, 0o600)
}

// Clear removes the state file. Called when the UI exits so an ephemeral
// snapshot never lingers as stale data.
func Clear() {
	_ = os.Remove(Path())
}
