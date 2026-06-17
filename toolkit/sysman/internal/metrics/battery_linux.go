//go:build linux

package metrics

import (
	"os"
	"strconv"
	"strings"
)

// readBattery reads the first present battery from the sysfs power-supply class
// (/sys/class/power_supply/BAT0, BAT1, …). Returns present=false when no battery
// node exists (desktops, servers, most VMs).
func readBattery() (present bool, percent int, state string) {
	for _, name := range []string{"BAT0", "BAT1", "BAT2"} {
		base := "/sys/class/power_supply/" + name
		capRaw, err := os.ReadFile(base + "/capacity")
		if err != nil {
			continue
		}
		pct, err := strconv.Atoi(strings.TrimSpace(string(capRaw)))
		if err != nil {
			continue
		}
		st := ""
		if raw, err := os.ReadFile(base + "/status"); err == nil {
			st = normalizeBatteryStatus(strings.TrimSpace(string(raw)))
		}
		return true, pct, st
	}
	return false, 0, ""
}

// GatherBatteryHealth derives battery health from sysfs: max capacity % is
// charge_full/charge_full_design (or the energy_* equivalents), plus the cycle
// count. Linux exposes no "condition" string. Zeros where unavailable.
func GatherBatteryHealth() (maxCapacityPct, cycles int, condition string) {
	for _, name := range []string{"BAT0", "BAT1", "BAT2"} {
		base := "/sys/class/power_supply/" + name
		full := readIntFile(base + "/charge_full")
		design := readIntFile(base + "/charge_full_design")
		if full == 0 || design == 0 {
			full = readIntFile(base + "/energy_full")
			design = readIntFile(base + "/energy_full_design")
		}
		if full > 0 && design > 0 {
			return int(float64(full) / float64(design) * 100), readIntFile(base + "/cycle_count"), ""
		}
	}
	return 0, 0, ""
}

func readIntFile(path string) int {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil {
		return 0
	}
	return n
}

func normalizeBatteryStatus(s string) string {
	switch strings.ToLower(s) {
	case "charging":
		return "charging"
	case "discharging":
		return "discharging"
	case "full":
		return "charged"
	case "not charging":
		return "ac"
	default:
		return strings.ToLower(s)
	}
}
