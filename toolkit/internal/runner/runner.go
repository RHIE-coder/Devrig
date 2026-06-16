// Package runner executes the actions declared in tool manifests: listing
// tools, running/building them in their own directory, and checking that their
// required runtimes are installed.
package runner

import (
	"fmt"
	"os"
	"os/exec"
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
func Run(root, name string, extra []string) error {
	m, err := manifest.Find(root, name)
	if err != nil {
		return err
	}
	if m.Run == "" {
		return fmt.Errorf("%s: no 'run' command defined in tool.yaml", name)
	}
	command := m.Run
	if len(extra) > 0 {
		command += " " + strings.Join(extra, " ")
	}
	return execIn(m.Dir, command)
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
