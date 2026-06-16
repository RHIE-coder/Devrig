package process

// Orphan detection is a per-OS heuristic. The exported functions here are the
// stable, cross-platform surface; each delegates to an unexported implementation
// selected at build time (orphan_darwin.go, orphan_linux.go, orphan_windows.go).

// LikelyOrphan reports whether a process is *probably* an orphan: a user-space
// process reparented to the OS init/reaper process because the parent that
// spawned it — typically a terminal/shell — has exited.
//
// On macOS/Linux the reaper is PID 1 (launchd / systemd), which is also the
// legitimate parent of most GUI apps and system daemons, so those are excluded
// by executable path. On Windows there is no reparenting reaper, so nothing is
// flagged. It is a hint, not a guarantee, so callers should hedge their wording.
func LikelyOrphan(ppid int32, cmdline string) bool {
	return likelyOrphan(ppid, cmdline)
}

// IsRootParent reports whether ppid is the OS init/reaper process that adopts
// orphaned processes (PID 1 — launchd on macOS, systemd/init on Linux). Always
// false on Windows, which has no such reparenting.
func IsRootParent(ppid int32) bool {
	return isRootParent(ppid)
}

// InitName is the display name of the OS init/reaper process ("launchd",
// "init"), or "" on platforms without one (Windows).
func InitName() string {
	return initName
}
