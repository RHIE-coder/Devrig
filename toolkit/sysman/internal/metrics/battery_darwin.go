//go:build darwin

package metrics

import (
	"os/exec"
	"strconv"
	"strings"
)

// readBattery parses `pmset -g batt` (unprivileged) for the internal battery's
// charge and state. Returns present=false on desktops/servers with no battery.
//
// A typical line:
//
//	-InternalBattery-0 (id=...)	87%; discharging; 3:41 remaining present: true
func readBattery() (present bool, percent int, state string) {
	out, err := exec.Command("pmset", "-g", "batt").Output()
	if err != nil {
		return false, 0, ""
	}
	text := string(out)
	if !strings.Contains(text, "InternalBattery") {
		return false, 0, "" // no internal battery (desktop)
	}
	return true, percentBefore(text), classifyBatteryState(text)
}

// percentBefore returns the integer preceding the first '%' in s (-1 if none).
func percentBefore(s string) int {
	i := strings.IndexByte(s, '%')
	if i < 0 {
		return -1
	}
	j := i
	for j > 0 && s[j-1] >= '0' && s[j-1] <= '9' {
		j--
	}
	n, err := strconv.Atoi(s[j:i])
	if err != nil {
		return -1
	}
	return n
}

// GatherBatteryHealth reads the battery's long-term condition from
// `system_profiler SPPowerDataType` — the same numbers macOS shows in Settings
// (Maximum Capacity, Cycle Count, Condition). It's slow (~1s), so callers run
// it lazily/once. Returns zeros when there's no battery.
func GatherBatteryHealth() (maxCapacityPct, cycles int, condition string) {
	out, err := exec.Command("system_profiler", "SPPowerDataType").Output()
	if err != nil {
		return 0, 0, ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "Maximum Capacity:"):
			maxCapacityPct = percentBefore(line)
		case strings.HasPrefix(line, "Cycle Count:"):
			cycles, _ = strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "Cycle Count:")))
		case strings.HasPrefix(line, "Condition:"):
			condition = strings.TrimSpace(strings.TrimPrefix(line, "Condition:"))
		}
	}
	return maxCapacityPct, cycles, condition
}

// classifyBatteryState maps pmset's wording to a small fixed vocabulary.
func classifyBatteryState(text string) string {
	t := strings.ToLower(text)
	switch {
	case strings.Contains(t, "discharging"):
		return "discharging"
	case strings.Contains(t, "charged"):
		return "charged"
	case strings.Contains(t, "finishing charge"), strings.Contains(t, "charging"):
		return "charging"
	case strings.Contains(t, "ac power"), strings.Contains(t, "ac attached"):
		return "ac"
	default:
		return ""
	}
}
