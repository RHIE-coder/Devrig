//go:build darwin

package process

import "strings"

// initName is the macOS init/reaper process that adopts orphaned processes.
const initName = "launchd"

// systemPrefixes are executable-path prefixes for OS-managed processes that are
// children of launchd (PID 1) by design — GUI apps, system daemons, login
// services. They are NOT orphans.
var systemPrefixes = []string{
	"/System/", "/Library/Apple/", "/Applications/",
	"/usr/libexec/", "/usr/sbin/", "/usr/bin/", "/sbin/", "/bin/",
}

func isRootParent(ppid int32) bool { return ppid == 1 }

func likelyOrphan(ppid int32, cmdline string) bool {
	if ppid != 1 {
		return false
	}
	cmd := strings.TrimSpace(cmdline)
	if cmd == "" {
		return false // unreadable cmdline → a system/root process we can't classify
	}
	exe := cmd
	if i := strings.IndexByte(cmd, ' '); i >= 0 {
		exe = cmd[:i] // first token is the executable
	}
	for _, p := range systemPrefixes {
		if strings.HasPrefix(exe, p) {
			return false
		}
	}
	// Anything under a Library/ dir — /Library, ~/Library, /System/Library — is
	// app support, a framework helper, or a login agent that launchd manages on
	// purpose (CoreSimulator, updaters, JetBrains/Codex daemons, …).
	if strings.Contains(exe, "/Library/") {
		return false
	}
	return true
}
