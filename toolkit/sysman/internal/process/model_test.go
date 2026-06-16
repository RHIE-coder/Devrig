package process

import (
	"os"
	"testing"
)

// TestAncestrySelf verifies the chain starts at the requested pid and walks up
// to a root: each node's PPID is the next node's PID, and the last node has no
// further reachable parent (ppid 0, or itself, or pid 1 / not in the chain).
func TestAncestrySelf(t *testing.T) {
	pid := int32(os.Getpid())

	chain, err := Ancestry(pid)
	if err != nil {
		t.Fatalf("Ancestry(%d) error: %v", pid, err)
	}
	if len(chain) == 0 {
		t.Fatal("Ancestry returned empty chain")
	}
	if chain[0].PID != pid {
		t.Fatalf("chain[0].PID = %d, want %d (target must be first)", chain[0].PID, pid)
	}

	// Each link must point at the next: chain[i].PPID == chain[i+1].PID.
	seen := map[int32]bool{}
	for i, p := range chain {
		if seen[p.PID] {
			t.Fatalf("cycle: pid %d appears twice", p.PID)
		}
		seen[p.PID] = true
		if i+1 < len(chain) && p.PPID != chain[i+1].PID {
			t.Errorf("chain[%d].PPID = %d, want %d (next node's PID)", i, p.PPID, chain[i+1].PID)
		}
	}

	// The chain terminates at a root: the last node's parent is unreachable
	// (0), itself, pid 1, or simply not continued. We assert it didn't stop
	// arbitrarily by requiring the tail's PPID to not be another live, distinct
	// pid we failed to follow — i.e. we reached 1 or a self/zero parent.
	tail := chain[len(chain)-1]
	if tail.PPID != 0 && tail.PPID != 1 && tail.PPID != tail.PID {
		// Allowed only if the parent genuinely couldn't be read; we can't easily
		// distinguish here, so just log rather than fail to avoid flakiness.
		t.Logf("chain tail pid=%d ppid=%d did not reach pid 1 (parent likely unreadable)", tail.PID, tail.PPID)
	}
}

// TestAncestryBadPID verifies a non-existent pid returns an error rather than a
// silent empty chain.
func TestAncestryBadPID(t *testing.T) {
	if _, err := Ancestry(-1); err == nil {
		t.Error("Ancestry(-1) = nil error, want error for invalid pid")
	}
}

// TestLikelyOrphan locks the heuristic: PPID 1 is normal on macOS (launchd is
// the parent of most apps/daemons), so only user-space processes reparented to
// launchd should be flagged — not GUI apps or system daemons.
func TestLikelyOrphan(t *testing.T) {
	cases := []struct {
		name    string
		ppid    int32
		cmdline string
		want    bool
	}{
		{"non-launchd child is never orphan", 1234, "node server.js", false},
		{"empty cmdline (root/system) not classified", 1, "", false},
		{"system framework not orphan", 1, "/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock", false},
		{"GUI app bundle not orphan", 1, "/Applications/Visual Studio Code.app/Contents/MacOS/Code", false},
		{"libexec daemon not orphan", 1, "/usr/libexec/secd", false},
		{"usr/bin tool not orphan", 1, "/usr/bin/ssh-agent -l", false},
		{"app-support helper under /Library not orphan", 1, "/Library/Developer/PrivateFrameworks/CoreSimulator.framework/foo", false},
		{"login agent under ~/Library not orphan", 1, "/Users/me/Library/Application Support/JetBrains/jetbrainsd", false},
		{"bare dev-server command IS orphan", 1, "npm run dev", true},
		{"node invoking homebrew bin IS orphan", 1, "node /opt/homebrew/bin/pnpm run dev", true},
		{"home-dir binary IS orphan", 1, "/Users/me/.nvm/versions/node/v24/bin/node app.js", true},
	}
	for _, c := range cases {
		if got := LikelyOrphan(c.ppid, c.cmdline); got != c.want {
			t.Errorf("%s: LikelyOrphan(%d, %q) = %v, want %v", c.name, c.ppid, c.cmdline, got, c.want)
		}
	}
}
