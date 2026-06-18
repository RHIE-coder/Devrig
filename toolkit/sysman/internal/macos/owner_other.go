//go:build !darwin

package macos

// isRootOwned is a stub off macOS: the uninstaller (and this whole package's
// mutating actions) are macOS-only, so this is never reached, but it keeps the
// package compiling on Linux/Windows where syscall.Stat_t differs or is absent.
func isRootOwned(string) bool { return false }
