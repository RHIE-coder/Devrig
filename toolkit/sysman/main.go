// Command sysman is a terminal UI ("System Manager") for inspecting and
// controlling operating-system state: which ports are held by which project,
// and the full process list.
//
// With `--json ports` or `--json ps` it runs headless and prints a JSON
// snapshot instead of launching the UI — handy for scripts and AI agents.
package main

import (
	"encoding/json"
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/app"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/ports"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/process"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/state"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--json" {
		if err := emitJSON(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "sysman:", err)
			os.Exit(1)
		}
		return
	}

	p := tea.NewProgram(app.New(), tea.WithAltScreen())
	_, err := p.Run()
	state.Clear() // ephemeral focus state must not linger after the UI closes
	if err != nil {
		fmt.Fprintf(os.Stderr, "sysman: %v\n", err)
		os.Exit(1)
	}
}

// emitJSON prints a JSON snapshot of ports or processes, then returns.
func emitJSON(args []string) error {
	kind := "ports"
	if len(args) > 0 {
		kind = args[0]
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")

	switch kind {
	case "ports":
		items, err := ports.Gather()
		if err != nil {
			return err
		}
		return enc.Encode(items)
	case "ps", "processes":
		items, err := process.Gather()
		if err != nil {
			return err
		}
		return enc.Encode(items)
	default:
		return fmt.Errorf("unknown json kind %q (use: ports | ps)", kind)
	}
}
