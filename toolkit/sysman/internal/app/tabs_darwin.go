//go:build darwin

package app

// systemTabEnabled gates the macOS-only System tab. On macOS it is shown; on
// every other OS it is hidden (the features — Spotlight repair, pmset — are
// macOS-specific).
const systemTabEnabled = true

var tabNames = []string{"Ports", "Processes", "System"}
