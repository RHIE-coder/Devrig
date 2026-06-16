package ports

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/timefmt"
)

func TestProjectName(t *testing.T) {
	// A temp project root marked by .git, with a nested working directory.
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "src", "server")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}

	if got, want := projectName(nested), filepath.Base(root); got != want {
		t.Errorf("projectName(nested) = %q, want %q (should walk up to marker)", got, want)
	}
	if got := projectName("/"); got != "—" {
		t.Errorf("projectName(\"/\") = %q, want %q", got, "—")
	}
	if got := projectName(""); got != "—" {
		t.Errorf("projectName(\"\") = %q, want %q", got, "—")
	}

	// No marker anywhere up the tree → fall back to the cwd's base name.
	bare := filepath.Join(t.TempDir(), "loose")
	if err := os.MkdirAll(bare, 0o755); err != nil {
		t.Fatal(err)
	}
	if got, want := projectName(bare), "loose"; got != want {
		t.Errorf("projectName(bare) = %q, want %q", got, want)
	}
}

func TestFilterListeners(t *testing.T) {
	items := []Listener{
		{Port: 3000, Process: "node", Project: "flare"},
		{Port: 5432, Process: "postgres", Project: "—"},
		{Port: 3001, Process: "node", Project: "Rhaumos"},
	}

	if got := filterListeners(items, ""); len(got) != 3 {
		t.Errorf("empty query should return all, got %d", len(got))
	}
	// By port substring.
	if got := filterListeners(items, "300"); len(got) != 2 {
		t.Errorf("query %q matched %d, want 2", "300", len(got))
	}
	// By process name.
	if got := filterListeners(items, "postgres"); len(got) != 1 || got[0].Port != 5432 {
		t.Errorf("query %q = %+v, want only :5432", "postgres", got)
	}
	// By project, case-insensitive.
	if got := filterListeners(items, "rhaumos"); len(got) != 1 || got[0].Port != 3001 {
		t.Errorf("query %q = %+v, want only :3001", "rhaumos", got)
	}
}

func TestGather(t *testing.T) {
	items, err := Gather()
	if err != nil {
		t.Fatalf("Gather returned error: %v", err)
	}
	for i := 1; i < len(items); i++ {
		if items[i-1].Port > items[i].Port {
			t.Errorf("listeners not sorted by port: %d before %d", items[i-1].Port, items[i].Port)
		}
	}
	withStart := 0
	for _, it := range items {
		if !it.Started.IsZero() {
			withStart++
		}
	}
	if len(items) > 0 && withStart == 0 {
		t.Error("no listener had a start time; CreateTime may not work here")
	}

	t.Logf("found %d TCP listeners (%d with start time)", len(items), withStart)
	for i, it := range items {
		if i >= 10 {
			break
		}
		t.Logf("  :%-6d pid=%-7d %-20s project=%-16s age=%s", it.Port, it.PID, it.Process, it.Project, timefmt.Age(it.Started))
	}
}
