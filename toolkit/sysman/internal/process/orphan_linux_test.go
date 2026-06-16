//go:build linux

package process

import "testing"

// TestLikelyOrphan locks the Linux heuristic: PID 1 (systemd/init) reaps orphans
// but is also the parent of system services, so only user-space PPID-1 processes
// outside the system paths should be flagged.
func TestLikelyOrphan(t *testing.T) {
	cases := []struct {
		name    string
		ppid    int32
		cmdline string
		want    bool
	}{
		{"non-init child is never orphan", 1234, "node server.js", false},
		{"empty cmdline (root/system) not classified", 1, "", false},
		{"systemd unit not orphan", 1, "/usr/lib/systemd/systemd-journald", false},
		{"sbin daemon not orphan", 1, "/usr/sbin/sshd -D", false},
		{"usr/bin tool not orphan", 1, "/usr/bin/dbus-daemon --system", false},
		{"bare dev-server command IS orphan", 1, "npm run dev", true},
		{"home-dir binary IS orphan", 1, "/home/me/.nvm/versions/node/v24/bin/node app.js", true},
	}
	for _, c := range cases {
		if got := LikelyOrphan(c.ppid, c.cmdline); got != c.want {
			t.Errorf("%s: LikelyOrphan(%d, %q) = %v, want %v", c.name, c.ppid, c.cmdline, got, c.want)
		}
	}
	if got := InitName(); got != "init" {
		t.Errorf("InitName() = %q, want \"init\"", got)
	}
	if !IsRootParent(1) || IsRootParent(2) {
		t.Errorf("IsRootParent: want true for 1 and false for 2")
	}
}
