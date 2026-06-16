//go:build windows

package process

import "testing"

// TestLikelyOrphan locks the Windows behavior: there is no init/reaper that
// adopts orphans, so nothing is flagged and there is no root parent to name.
func TestLikelyOrphan(t *testing.T) {
	cases := []struct {
		ppid    int32
		cmdline string
	}{
		{1, "npm run dev"},
		{4, `C:\Windows\System32\svchost.exe`},
		{0, ""},
		{1234, `C:\Users\me\app.exe`},
	}
	for _, c := range cases {
		if LikelyOrphan(c.ppid, c.cmdline) {
			t.Errorf("LikelyOrphan(%d, %q) = true, want false on Windows", c.ppid, c.cmdline)
		}
	}
	if IsRootParent(1) || IsRootParent(4) {
		t.Error("IsRootParent should always be false on Windows")
	}
	if got := InitName(); got != "" {
		t.Errorf("InitName() = %q, want \"\" on Windows", got)
	}
}
