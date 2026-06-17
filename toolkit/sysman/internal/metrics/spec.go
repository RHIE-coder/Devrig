package metrics

import (
	"strings"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// Spec is the static hardware/OS configuration of the device — the things that
// don't change while sysman runs, so it is gathered once rather than every
// tick. Fields that a platform can't supply are left zero/empty and omitted
// from the view.
type Spec struct {
	Hostname       string  `json:"hostname"`
	Model          string  `json:"model,omitempty"`          // machine identifier, e.g. "Mac14,9" (darwin)
	CPUModel       string  `json:"cpu_model"`                // e.g. "Apple M2 Pro"
	LogicalCPU     int     `json:"logical_cpu"`              // logical (hyperthread) cores
	PhysicalCPU    int     `json:"physical_cpu"`             // physical cores
	PerfCores      int     `json:"perf_cores,omitempty"`     // performance cores (Apple Silicon)
	EffCores       int     `json:"eff_cores,omitempty"`      // efficiency cores (Apple Silicon)
	GPUCores       int     `json:"gpu_cores,omitempty"`      // integrated GPU cores (Apple Silicon)
	CPUMHz         float64 `json:"cpu_mhz,omitempty"`        // nominal clock
	MemTotal       uint64  `json:"mem_total"`                // installed RAM (bytes)
	DiskTotal      uint64  `json:"disk_total"`               // root filesystem size (bytes)
	DiskFstype     string  `json:"disk_fstype,omitempty"`    // root filesystem type
	OS             string  `json:"os"`                       // "macOS 26.0.1", "ubuntu 22.04", …
	Arch           string  `json:"arch"`                     // "arm64", "amd64", …
	Kernel         string  `json:"kernel,omitempty"`         // kernel version
	Virtualization string  `json:"virtualization,omitempty"` // hypervisor, if running in a VM

	// Battery health (laptops). Read separately from the fast spec because the
	// source (system_profiler on macOS) is slow; zero/empty where unavailable.
	BatteryMaxCapacityPct int    `json:"battery_max_capacity_pct,omitempty"` // current max charge vs design (수명)
	BatteryCycles         int    `json:"battery_cycles,omitempty"`           // charge cycle count
	BatteryCondition      string `json:"battery_condition,omitempty"`        // e.g. "Normal"
}

// GatherSpec reads the device's static configuration. Best-effort: missing
// readings stay zero. augmentSpec adds OS-specific detail (P/E core split, GPU
// cores, machine model) on platforms that expose it.
func GatherSpec() Spec {
	var s Spec
	if hi, err := host.Info(); err == nil && hi != nil {
		s.Hostname = hi.Hostname
		s.OS = prettyOS(hi)
		s.Arch = hi.KernelArch
		s.Kernel = hi.KernelVersion
		s.Virtualization = hi.VirtualizationSystem
	}
	if ci, err := cpu.Info(); err == nil && len(ci) > 0 {
		s.CPUModel = ci[0].ModelName
		s.CPUMHz = ci[0].Mhz
	}
	s.LogicalCPU, _ = cpu.Counts(true)
	s.PhysicalCPU, _ = cpu.Counts(false)
	if du, err := disk.Usage("/"); err == nil && du != nil {
		s.DiskTotal, s.DiskFstype = du.Total, du.Fstype
	}
	if vm, err := mem.VirtualMemory(); err == nil && vm != nil {
		s.MemTotal = vm.Total
	}
	augmentSpec(&s)
	return s
}

// prettyOS turns gopsutil's host fields into a friendly OS label. On macOS the
// PlatformVersion is the macOS version (e.g. "26.0.1"); on Linux Platform is the
// distro (e.g. "ubuntu").
func prettyOS(hi *host.InfoStat) string {
	switch hi.OS {
	case "darwin":
		if hi.PlatformVersion != "" {
			return "macOS " + hi.PlatformVersion
		}
		return "macOS"
	default:
		name := hi.Platform
		if name == "" {
			name = hi.OS
		}
		return strings.TrimSpace(name + " " + hi.PlatformVersion)
	}
}
