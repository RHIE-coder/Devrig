//go:build linux

package process

import "strings"

// initName is the PID 1 reaper. Distros run systemd or sysvinit; "init" is the
// neutral name shown in the UI.
const initName = "init"

// systemPrefixes are executable-path prefixes for OS-managed processes that are
// legitimately children of PID 1 (systemd/init) — system services and daemons.
// They are NOT orphans.
var systemPrefixes = []string{
	"/usr/lib/systemd/", "/lib/systemd/", "/usr/libexec/",
	"/usr/sbin/", "/sbin/", "/usr/bin/", "/bin/",
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
	return true
}
