//go:build !darwin

package app

// systemTabEnabled is false off macOS: the System tab's actions (Spotlight
// index repair, pmset disablesleep) are macOS-only, so the tab is hidden.
const systemTabEnabled = false

var tabNames = []string{"Ports", "Processes"}
