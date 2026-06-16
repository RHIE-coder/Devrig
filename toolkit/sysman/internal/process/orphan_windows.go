//go:build windows

package process

// Windows has no init/reaper process that adopts orphans. When a parent exits,
// the child keeps its now-dangling PPID (which the OS may even recycle), so
// there is no reliable reparent target to flag from (ppid, cmdline) alone. We
// therefore don't classify orphans on Windows, and there is no single root
// parent process to name.
const initName = ""

func isRootParent(ppid int32) bool { return false }

func likelyOrphan(ppid int32, cmdline string) bool { return false }
