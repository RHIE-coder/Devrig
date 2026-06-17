//go:build darwin

package app

// systemTabEnabled gates the macOS-only Maintenance tab. On macOS it is shown;
// on every other OS it is hidden (the features — Spotlight repair, pmset — are
// macOS-specific).
const systemTabEnabled = true

// tabNames maps each view index to its user-facing label. "System" is the
// device status/spec/metrics tab (viewMetrics); the macOS maintenance tab is
// labelled "Maintenance (macOS)" so the OS dependency is explicit and it no
// longer reads like it overlaps with the status tab.
var tabNames = []string{"System", "Ports", "Processes", "Maintenance (macOS)"}
