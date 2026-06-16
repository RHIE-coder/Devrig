// Package macos implements the System tab: macOS-only maintenance utilities
// (Spotlight index repair and the pmset disablesleep toggle). The tab is only
// registered on macOS (see app/app_darwin.go); on other systems it is hidden.
//
// Reads (mdutil -s, pmset -g) are unprivileged. The mutating actions need root,
// so instead of capturing a sudo password inside the TUI they shell out through
// osascript's "with administrator privileges", which shows the native macOS
// authentication dialog.
package macos

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// errNotDarwin guards the mutating actions so they can never run on a non-macOS
// host even if somehow invoked (the tab itself is hidden off macOS).
var errNotDarwin = fmt.Errorf("이 기능은 macOS 전용입니다")

// Status is a read-only snapshot of the settings this tab manages.
type Status struct {
	SpotlightHealthy bool     // every volume is "Indexing enabled" (no error/disabled)
	SpotlightLines   []string // per-volume state, e.g. "/ — Indexing enabled."
	SleepDisabled    bool     // pmset disablesleep == 1 (the Mac never sleeps)
	SleepKnown       bool     // false if disablesleep wasn't present in `pmset -g`
}

// readStatus queries Spotlight indexing state (all volumes) and the pmset
// disablesleep flag. Both are unprivileged, so no auth dialog appears.
//
// All volumes matter: `mdutil -s /` can report "Indexing enabled" while the
// Data volume — where /Applications actually lives — is in an error state, which
// is exactly the "an app exists but Spotlight can't find it" symptom.
func readStatus() (Status, error) {
	if runtime.GOOS != "darwin" {
		return Status{}, errNotDarwin
	}
	var st Status

	out, err := exec.Command("mdutil", "-s", "-a").CombinedOutput()
	if err == nil {
		st.SpotlightHealthy, st.SpotlightLines = parseSpotlight(string(out))
	} else {
		st.SpotlightLines = []string{collapse(string(out))}
	}

	if out, err := exec.Command("pmset", "-g").CombinedOutput(); err == nil {
		if v, ok := parseDisableSleep(string(out)); ok {
			st.SleepDisabled = v == 1
			st.SleepKnown = true
		}
	}
	return st, nil
}

// rebuildSpotlight resets the Spotlight index for the boot volume group: it
// disables indexing, removes the (often corrupt/stuck) index directory with
// -X, then re-enables it so the index is rebuilt from scratch — the reliable
// fix when the Data volume is stuck in "unknown indexing state" and apps go
// missing from search.
//
// It targets "/" (the firmlinked root), NOT "-a": erase/remove operations on
// the raw /System/Volumes/Data and Preboot mounts return "invalid operation",
// which is what aborted the earlier -E -a approach. "/"'s store physically
// lives on the Data volume, so resetting "/" clears the broken store. Requires
// admin; the re-index then runs in the background for a few minutes.
func rebuildSpotlight() (string, error) {
	return runAdmin("mdutil -i off / && mdutil -X / && mdutil -i on /")
}

// setDisableSleep sets pmset disablesleep across all power sources. Requires
// admin. on=true makes the Mac never sleep (disablesleep 1).
func setDisableSleep(on bool) (string, error) {
	v := "0"
	if on {
		v = "1"
	}
	return runAdmin("pmset -a disablesleep " + v)
}

// runAdmin runs a /bin/sh command as root via osascript, which surfaces the
// native macOS authentication dialog — so the TUI never handles a password. A
// cancelled prompt comes back as an error (osascript reports "User canceled.").
func runAdmin(shellCmd string) (string, error) {
	if runtime.GOOS != "darwin" {
		return "", errNotDarwin
	}
	// Escape for the AppleScript double-quoted string literal.
	esc := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(shellCmd)
	script := `do shell script "` + esc + `" with administrator privileges`
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	res := strings.TrimSpace(string(out))
	if err != nil {
		if res != "" {
			return res, fmt.Errorf("%s", firstLine(res))
		}
		return "", err
	}
	return res, nil
}

// parseSpotlight turns `mdutil -s -a` output into per-volume status lines and a
// healthy flag. healthy is true only when every volume reports "Indexing
// enabled"; any error/unknown/disabled state makes it false. Duplicate volume
// entries (firmlinks report the Data volume twice) are collapsed.
func parseSpotlight(out string) (healthy bool, lines []string) {
	healthy = true
	seen := map[string]bool{}
	var vol string
	for _, ln := range strings.Split(out, "\n") {
		t := strings.TrimSpace(ln)
		if t == "" {
			continue
		}
		if strings.HasSuffix(t, ":") {
			vol = strings.TrimSuffix(t, ":")
			continue
		}
		entry := t
		if vol != "" {
			entry = vol + " — " + t
		}
		vol = ""
		if seen[entry] {
			continue
		}
		seen[entry] = true
		lines = append(lines, entry)
		if !strings.Contains(t, "Indexing enabled") {
			healthy = false
		}
	}
	if len(lines) == 0 {
		return strings.Contains(out, "Indexing enabled"), []string{collapse(out)}
	}
	return healthy, lines
}

// parseDisableSleep finds the "disablesleep <n>" field in `pmset -g` output.
func parseDisableSleep(out string) (val int, found bool) {
	for _, ln := range strings.Split(out, "\n") {
		f := strings.Fields(ln)
		if len(f) >= 2 && f[0] == "disablesleep" {
			if n, err := strconv.Atoi(f[1]); err == nil {
				return n, true
			}
		}
	}
	return 0, false
}

// collapse flattens whitespace (incl. newlines) so multi-line command output
// fits on a single status line.
func collapse(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
