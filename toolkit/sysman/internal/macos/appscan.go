// This file holds the macOS app-uninstaller logic behind the "앱 제거" sub-tab:
// listing installed apps, resolving each app's bundle identifier, finding the
// support/cache/preference/launch-agent leftovers it scatters across ~/Library
// and /Library, and removing the whole set (to Trash by default, or permanently).
//
// Matching is bundle-ID-first (com.foo.app and its com.foo.app.* helpers, plus
// <team>.com.foo.app group containers) because that is unambiguous; matching by
// the app's display name is a fallback that is flagged in the UI as needing a
// human look, since names like "Notes" collide. The default removal is a
// reversible move to Trash, so even a wrong match is recoverable.
package macos

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// appEntry is one installed application (a .app bundle) the user could remove.
type appEntry struct {
	Name string // display name without the ".app" suffix, e.g. "Visual Studio Code"
	Path string // absolute path, e.g. "/Applications/Visual Studio Code.app"
}

// leftover is one file or directory belonging to an app: the bundle itself, or
// a support/cache/preference/launch-agent item found by matching.
type leftover struct {
	Path   string // absolute path
	SizeKB int64  // du -sk size in KiB (0 if unreadable)
	ByName bool   // matched by display name, not bundle ID — flag for human review
	System bool   // lives under /Library or /var (removing it needs admin)
	IsApp  bool   // the .app bundle itself
}

// removalPlan is everything scanApp found for one app: the app, its bundle ID,
// and the full set of items that would be removed, with a size total.
type removalPlan struct {
	App      appEntry
	BundleID string
	Items    []leftover
	TotalKB  int64
}

// appDirs are the locations scanned for installable apps. /System/Applications
// is deliberately excluded — those are SIP-protected Apple apps that can't (and
// shouldn't) be removed this way.
func appDirs() []string {
	dirs := []string{"/Applications", "/Applications/Utilities"}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dirs = append(dirs, filepath.Join(home, "Applications"))
	}
	return dirs
}

// userLibSubdirs are the ~/Library subdirectories where apps drop per-user
// leftovers (no admin needed to remove).
var userLibSubdirs = []string{
	"Application Support", "Caches", "Preferences", "Containers",
	"Group Containers", "Saved Application State", "HTTPStorages", "Logs",
	"WebKit", "Cookies", "LaunchAgents", "Application Scripts",
	"Internet Plug-Ins",
}

// sysLibSubdirs are the /Library subdirectories where apps drop machine-wide
// leftovers — notably LaunchDaemons (background services that keep running after
// the app is gone). Removing these needs admin.
var sysLibSubdirs = []string{
	"Application Support", "Caches", "LaunchAgents", "LaunchDaemons",
	"PrivilegedHelperTools", "Preferences", "Extensions", "Internet Plug-Ins",
}

// listApps returns the .app bundles under appDirs, de-duplicated and sorted by
// name. It does NOT read bundle IDs (one PlistBuddy spawn per app would be slow
// for a few hundred apps); the bundle ID is read lazily in scanApp.
func listApps() ([]appEntry, error) {
	if runtime.GOOS != "darwin" {
		return nil, errNotDarwin
	}
	seen := map[string]bool{}
	var apps []appEntry
	for _, dir := range appDirs() {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue // dir may not exist (e.g. ~/Applications)
		}
		for _, e := range entries {
			if !strings.HasSuffix(e.Name(), ".app") {
				continue
			}
			p := filepath.Join(dir, e.Name())
			if seen[p] {
				continue
			}
			seen[p] = true
			apps = append(apps, appEntry{
				Name: strings.TrimSuffix(e.Name(), ".app"),
				Path: p,
			})
		}
	}
	sort.Slice(apps, func(i, j int) bool {
		return strings.ToLower(apps[i].Name) < strings.ToLower(apps[j].Name)
	})
	return apps, nil
}

// bundleID reads CFBundleIdentifier from the app's Info.plist via PlistBuddy
// (always present on macOS). Returns "" if it can't be read — the caller then
// falls back to name-only matching and flags everything for review.
func bundleID(appPath string) string {
	out, err := exec.Command("/usr/libexec/PlistBuddy",
		"-c", "Print :CFBundleIdentifier",
		filepath.Join(appPath, "Contents", "Info.plist")).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// scanApp resolves the app's bundle ID and walks every leftover location,
// collecting matches with their sizes. The .app bundle itself is always the
// first item.
func scanApp(app appEntry) (removalPlan, error) {
	if runtime.GOOS != "darwin" {
		return removalPlan{}, errNotDarwin
	}
	bid := bundleID(app.Path)
	plan := removalPlan{App: app, BundleID: bid}

	add := func(path string, byName, system, isApp bool) {
		sz := dirSizeKB(path)
		plan.Items = append(plan.Items, leftover{
			Path: path, SizeKB: sz, ByName: byName, System: system, IsApp: isApp,
		})
		plan.TotalKB += sz
	}

	seen := map[string]bool{app.Path: true}
	add(app.Path, false, isRootOwned(app.Path), true)

	type loc struct {
		dir    string
		system bool
	}
	var locs []loc
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		lib := filepath.Join(home, "Library")
		for _, sub := range userLibSubdirs {
			locs = append(locs, loc{filepath.Join(lib, sub), false})
		}
	}
	for _, sub := range sysLibSubdirs {
		locs = append(locs, loc{filepath.Join("/Library", sub), true})
	}
	locs = append(locs, loc{"/var/db/receipts", true}) // pkg install records

	for _, l := range locs {
		entries, err := os.ReadDir(l.dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			ok, byName := leftoverMatches(e.Name(), bid, app.Name)
			if !ok {
				continue
			}
			p := filepath.Join(l.dir, e.Name())
			if seen[p] {
				continue
			}
			seen[p] = true
			add(p, byName, l.system, false)
		}
	}
	return plan, nil
}

// leftoverMatches decides whether a file/dir named entryName belongs to the app
// identified by bundleID / appName. It returns whether it matched and whether
// the match was name-based (the weaker signal, flagged in the UI).
//
// Bundle-ID matches (strong):
//   - exact:            com.foo.app
//   - dotted-prefix:    com.foo.app.helper           (helpers, XPC services)
//   - dotted-suffix:    ABCDE12345.com.foo.app       (team-prefixed group containers)
//
// Name match (weak, flagged): the name (minus a known extension) equals the
// app's display name, case-insensitively — e.g. "~/Library/Logs/Foo".
func leftoverMatches(entryName, bundleID, appName string) (match, byName bool) {
	base := entryName
	for _, ext := range []string{".plist", ".savedState", ".binarycookies", ".bom"} {
		base = strings.TrimSuffix(base, ext)
	}
	if bundleID != "" {
		if base == bundleID ||
			strings.HasPrefix(base, bundleID+".") ||
			strings.HasSuffix(base, "."+bundleID) {
			return true, false
		}
	}
	if appName != "" && strings.EqualFold(base, appName) {
		return true, true
	}
	return false, false
}

// performRemoval removes every item in the plan. permanent=false (the default)
// moves them to the Trash via Finder (reversible, and Finder handles admin
// prompts for protected items); permanent=true runs rm -rf, escalating to admin
// only for the paths the current user can't delete directly.
func performRemoval(plan removalPlan, permanent bool) (string, error) {
	if runtime.GOOS != "darwin" {
		return "", errNotDarwin
	}
	paths := make([]string, 0, len(plan.Items))
	for _, it := range plan.Items {
		paths = append(paths, it.Path)
	}
	if len(paths) == 0 {
		return "삭제할 항목이 없습니다", nil
	}
	if permanent {
		return removePermanent(paths)
	}
	return moveToTrash(paths)
}

// moveToTrash sends every path to the Trash in one Finder call. Finder records
// "Put Back" info (so it's reversible) and raises its own auth dialog for any
// admin-owned item. The first call may prompt the user to allow controlling
// Finder (macOS Automation permission).
func moveToTrash(paths []string) (string, error) {
	esc := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	var b strings.Builder
	b.WriteString(`tell application "Finder" to delete {`)
	for i, p := range paths {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(`POSIX file "` + esc.Replace(p) + `"`)
	}
	b.WriteString("}")

	out, err := exec.Command("osascript", "-e", b.String()).CombinedOutput()
	res := strings.TrimSpace(string(out))
	if err != nil {
		if res != "" {
			return res, fmt.Errorf("%s", firstLine(res))
		}
		return "", err
	}
	return fmt.Sprintf("%d개 항목을 휴지통으로 이동", len(paths)), nil
}

// removePermanent deletes paths irreversibly. It tries os.RemoveAll first; any
// path that fails (typically a root-owned /Library item) is collected and wiped
// in a single admin rm -rf so the user sees at most one auth dialog.
func removePermanent(paths []string) (string, error) {
	var failed []string
	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil {
			failed = append(failed, p)
		}
	}
	if len(failed) > 0 {
		var b strings.Builder
		b.WriteString("rm -rf")
		for _, p := range failed {
			b.WriteString(" " + shellQuote(p))
		}
		if out, err := runAdmin(b.String()); err != nil {
			return out, err
		}
	}
	return fmt.Sprintf("%d개 항목 영구 삭제", len(paths)), nil
}

// dirSizeKB returns the on-disk size of path in KiB via `du -sk`. Returns 0 if
// du can't read it (e.g. a protected /Library item scanned without admin).
func dirSizeKB(path string) int64 {
	out, err := exec.Command("du", "-sk", path).Output()
	if err != nil {
		return 0
	}
	f := strings.Fields(string(out))
	if len(f) == 0 {
		return 0
	}
	n, _ := strconv.ParseInt(f[0], 10, 64)
	return n
}

// shellQuote single-quotes a path for safe use in the admin rm -rf command.
func shellQuote(p string) string {
	return "'" + strings.ReplaceAll(p, "'", `'\''`) + "'"
}

// humanSize formats a KiB count as a compact, human-readable size.
func humanSize(kb int64) string {
	switch {
	case kb <= 0:
		return "—"
	case kb < 1024:
		return fmt.Sprintf("%d KB", kb)
	case kb < 1024*1024:
		return fmt.Sprintf("%.1f MB", float64(kb)/1024)
	default:
		return fmt.Sprintf("%.2f GB", float64(kb)/(1024*1024))
	}
}
