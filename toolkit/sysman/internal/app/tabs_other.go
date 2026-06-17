//go:build !darwin

package app

// systemTabEnabled is false off macOS: the Maintenance tab's actions (Spotlight
// index repair, pmset disablesleep) are macOS-only, so the tab is hidden. The
// "System" tab below is the cross-platform device status/metrics view.
const systemTabEnabled = false

var tabNames = []string{"System", "Ports", "Processes"}
