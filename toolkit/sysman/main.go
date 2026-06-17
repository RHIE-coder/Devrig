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
	"strconv"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/app"
	"github.com/rhie-coder/devrig/toolkit/sysman/internal/metrics"
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
	case "metrics", "metric":
		// Two samples ~700ms apart so the snapshot carries real network/disk
		// rates (the first call only primes the counters); the static hardware
		// spec is gathered once and nested under "spec".
		spec := metrics.GatherSpec()
		spec.BatteryMaxCapacityPct, spec.BatteryCycles, spec.BatteryCondition = metrics.GatherBatteryHealth()
		online, latency := metrics.MeasureLatency()
		return enc.Encode(struct {
			Spec metrics.Spec `json:"spec"`
			metrics.Snapshot
			NetOnline    bool    `json:"net_online"`
			NetLatencyMs float64 `json:"net_latency_ms"`
		}{
			Spec:         spec,
			Snapshot:     metrics.SampleRates(700 * time.Millisecond),
			NetOnline:    online,
			NetLatencyMs: latency,
		})
	case "tree", "ancestry":
		if len(args) < 2 {
			return fmt.Errorf("json %s needs a pid: --json %s <pid>", kind, kind)
		}
		pid, err := strconv.Atoi(args[1])
		if err != nil {
			return fmt.Errorf("invalid pid %q: %w", args[1], err)
		}
		chain, err := process.Ancestry(int32(pid))
		if err != nil {
			return err
		}
		return enc.Encode(chain)
	default:
		return fmt.Errorf("unknown json kind %q (use: ports | ps | metrics | tree <pid>)", kind)
	}
}
