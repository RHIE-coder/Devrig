//go:build darwin

package macos

import (
	"os"
	"syscall"
)

// isRootOwned reports whether path is owned by root — a hint that removing it
// will need admin (App Store / pkg-installed bundles are often root-owned).
func isRootOwned(path string) bool {
	fi, err := os.Lstat(path)
	if err != nil {
		return false
	}
	if st, ok := fi.Sys().(*syscall.Stat_t); ok {
		return st.Uid == 0
	}
	return false
}
