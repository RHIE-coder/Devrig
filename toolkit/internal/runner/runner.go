// Package runner executes the actions declared in tool manifests: listing
// tools, running/building them in their own directory, and checking that their
// required runtimes are installed.
package runner

import (
	"fmt"
	"hash/fnv"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"text/tabwriter"

	"github.com/rhie-coder/devrig/toolkit/internal/manifest"
)

// List prints all discovered tools as an aligned table.
func List(root string) error {
	tools, err := manifest.Discover(root)
	if err != nil {
		return err
	}
	if len(tools) == 0 {
		fmt.Println("등록된 도구가 없습니다. toolkit/<name>/tool.yaml 을 추가하세요.")
		return nil
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "NAME\tLANG\tDESCRIPTION")
	for _, m := range tools {
		fmt.Fprintf(w, "%s\t%s\t%s\n", m.Name, m.Lang, m.Description)
	}
	return w.Flush()
}

// Run executes a tool's run command in its own directory, inheriting the
// terminal so interactive TUIs work transparently. Any extra args are appended
// to the run command and thus forwarded to the tool (e.g. `--json ports`).
//
// For Go tools launched via `go run` (the toolkit default), Run takes a fast
// path: it builds a cached binary once and execs that. `go run` relinks a
// throwaway binary on *every* launch — the visible ~1-2s stall before the TUI
// appears — whereas a cached `go build` skips the relink when nothing changed
// (Go's build cache keeps it correct), so repeat launches are a bare exec.
func Run(root, name string, extra []string) error {
	m, err := manifest.Find(root, name)
	if err != nil {
		return err
	}
	if m.Run == "" {
		return fmt.Errorf("%s: no 'run' command defined in tool.yaml", name)
	}

	if bin, ok := cachedGoBinary(m); ok {
		return execBin(m.Dir, bin, extra)
	}

	command := m.Run
	if len(extra) > 0 {
		command += " " + strings.Join(extra, " ")
	}
	return execIn(m.Dir, command)
}

// cachedGoBinary builds a Go tool into a per-tool cached binary and returns its
// path. ok is false — and the caller falls back to the declared run command —
// for non-Go tools, tools not using `go run`, or any build/setup failure: a
// stale cache or odd environment must never block launching.
func cachedGoBinary(m *manifest.Manifest) (bin string, ok bool) {
	if m.Lang != "go" || !strings.HasPrefix(strings.TrimSpace(m.Run), "go run") {
		return "", false
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", false
	}
	abs, err := filepath.Abs(m.Dir)
	if err != nil {
		return "", false
	}
	binDir := filepath.Join(cache, "devrig", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		return "", false
	}
	// Key the binary by the tool's absolute dir so two checkouts of the same
	// tool don't clobber each other's cached build.
	h := fnv.New32a()
	_, _ = h.Write([]byte(abs))
	bin = filepath.Join(binDir, fmt.Sprintf("%s-%08x", m.Name, h.Sum32()))
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}

	// `go build` recompiles only changed packages and skips the relink when the
	// output is already current, so this is cheap on repeat launches. Build
	// diagnostics go to stderr to keep stdout clean for headless --json callers.
	build := exec.Command("go", "build", "-o", bin, ".")
	build.Dir = m.Dir
	build.Stdout = os.Stderr
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		return "", false
	}
	return bin, true
}

// Build executes a tool's build command in its own directory.
func Build(root, name string) error {
	m, err := manifest.Find(root, name)
	if err != nil {
		return err
	}
	if m.Build == "" {
		return fmt.Errorf("%s: no 'build' command defined in tool.yaml", name)
	}
	return execIn(m.Dir, m.Build)
}

// Doctor checks that each tool's required runtimes are on PATH.
func Doctor(root, name string) error {
	tools, err := manifest.Discover(root)
	if err != nil {
		return err
	}

	missing := false
	for _, m := range tools {
		if name != "" && m.Name != name {
			continue
		}
		fmt.Printf("%s (%s)\n", m.Name, m.Lang)
		if len(m.Requires) == 0 {
			fmt.Println("  (전제조건 없음)")
		}
		for _, req := range m.Requires {
			if path, err := exec.LookPath(req); err == nil {
				fmt.Printf("  ✓ %s — %s\n", req, path)
			} else {
				fmt.Printf("  ✗ %s — 설치 필요 (루트 README의 '개발 환경 설치' 참고)\n", req)
				missing = true
			}
		}
	}
	if missing {
		return fmt.Errorf("일부 전제조건이 누락되었습니다")
	}
	return nil
}

// execIn runs a shell command in dir, wiring the parent's stdio through.
func execIn(dir, command string) error {
	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = dir
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// execBin runs a prebuilt binary in dir with extra args, wiring the parent's
// stdio through so interactive TUIs work transparently.
func execBin(dir, bin string, extra []string) error {
	cmd := exec.Command(bin, extra...)
	cmd.Dir = dir
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
