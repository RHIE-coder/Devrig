//go:build !darwin && !linux

package metrics

// readBattery is unimplemented off macOS/Linux: battery readout would need a
// platform-specific source (e.g. WMI on Windows). Callers treat present=false
// as "no battery / not supported" and simply omit the battery line.
func readBattery() (present bool, percent int, state string) {
	return false, 0, ""
}

// GatherBatteryHealth is unimplemented off macOS/Linux.
func GatherBatteryHealth() (maxCapacityPct, cycles int, condition string) {
	return 0, 0, ""
}
