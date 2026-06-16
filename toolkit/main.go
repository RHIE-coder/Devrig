// Command toolkit is the DevRig toolkit gateway: a single entry point that
// discovers every tool under toolkit/ (via its tool.yaml manifest) and can
// list, run, build, or check prerequisites for them — so you never have to
// remember each tool's individual run/setup steps. Run with no arguments to
// pick a tool interactively.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/term"

	"github.com/rhie-coder/devrig/toolkit/internal/manifest"
	"github.com/rhie-coder/devrig/toolkit/internal/menu"
	"github.com/rhie-coder/devrig/toolkit/internal/runner"
)

// defaultRoot is baked into installed binaries via
// `-ldflags "-X main.defaultRoot=/abs/path/to/toolkit"` (see install.sh) so the
// command works from any directory, not just inside a checkout.
var defaultRoot string

// prog is the name the binary was invoked as (e.g. "devrig"), used in messages.
func prog() string {
	if len(os.Args) > 0 && os.Args[0] != "" {
		return filepath.Base(os.Args[0])
	}
	return "devrig"
}

func main() {
	if err := dispatch(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", prog(), err)
		os.Exit(1)
	}
}

func dispatch(args []string) error {
	var cmd string
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}

	switch cmd {
	case "help", "-h", "--help":
		printUsage()
		return nil
	}

	root, err := manifest.FindRoot(defaultRoot)
	if err != nil {
		return err
	}

	switch cmd {
	case "":
		return interactive(root)
	case "list", "ls":
		return runner.List(root)
	case "run":
		if len(args) < 1 {
			return fmt.Errorf("usage: toolkit run <name> [args...]")
		}
		return runner.Run(root, args[0], args[1:])
	case "build":
		if len(args) < 1 {
			return fmt.Errorf("usage: toolkit build <name>")
		}
		return runner.Build(root, args[0])
	case "doctor":
		name := ""
		if len(args) > 0 {
			name = args[0]
		}
		return runner.Doctor(root, name)
	default:
		printUsage()
		return fmt.Errorf("unknown command %q", cmd)
	}
}

// interactive opens the tool picker when attached to a terminal, otherwise it
// degrades to a plain list (e.g. when output is piped).
func interactive(root string) error {
	tools, err := manifest.Discover(root)
	if err != nil {
		return err
	}
	if len(tools) == 0 || !term.IsTerminal(int(os.Stdout.Fd())) {
		return runner.List(root)
	}

	name, err := menu.Select(tools)
	if err != nil {
		return err
	}
	if name == "" {
		return nil // user quit without choosing
	}
	return runner.Run(root, name, nil)
}

func printUsage() {
	p := prog()
	fmt.Printf(`%[1]s — DevRig toolkit gateway

Usage:
  %[1]s                     인터랙티브 메뉴로 도구 선택·실행 (TTY)
  %[1]s list                모든 도구 나열
  %[1]s run <name> [args…]  도구 실행 (args는 도구로 그대로 전달; TUI도 동작)
  %[1]s build <name>        도구 빌드
  %[1]s doctor [name]       전제조건(런타임) 설치 여부 점검
  %[1]s help                이 도움말

도구는 toolkit/<name>/tool.yaml 매니페스트로 자동 인식됩니다.
어디서든 '%[1]s'로 실행하려면: toolkit/install.sh (macOS/Linux) 또는 install.ps1 (Windows).
`, p)
}
