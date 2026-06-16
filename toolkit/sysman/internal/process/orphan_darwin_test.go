//go:build darwin

package process

import "testing"

// TestLikelyOrphan locks the macOS heuristic: PPID 1 is normal on macOS (launchd
// is the parent of most apps/daemons), so only user-space processes reparented
// to launchd should be flagged — not GUI apps or system daemons.
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
	if got := InitName(); got != "launchd" {
		t.Errorf("InitName() = %q, want \"launchd\"", got)
	}
	if !IsRootParent(1) || IsRootParent(2) {
		t.Errorf("IsRootParent: want true for 1 and false for 2")
	}
}
