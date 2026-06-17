//go:build darwin

package metrics

import (
	"os/exec"
	"strconv"
	"strings"
)

// augmentSpec fills the Apple-Silicon-specific fields that gopsutil doesn't
// expose: the performance/efficiency core split (sysctl hw.perflevel*), the
// integrated GPU core count (IORegistry), and the machine model identifier
// (sysctl hw.model). All best-effort — a failure just leaves the field zero.
func augmentSpec(s *Spec) {
	s.PerfCores = sysctlInt("hw.perflevel0.logicalcpu")
	s.EffCores = sysctlInt("hw.perflevel1.logicalcpu")
	s.Model = sysctlStr("hw.model")
	s.GPUCores = gpuCoreCount()
}

func sysctlStr(key string) string {
	out, err := exec.Command("sysctl", "-n", key).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func sysctlInt(key string) int {
	n, err := strconv.Atoi(sysctlStr(key))
	if err != nil {
		return 0
	}
	return n
}

// gpuCoreCount reads the integrated GPU's "gpu-core-count" property from the
// IORegistry. ioreg -l is a touch heavy, but this runs once at startup.
func gpuCoreCount() int {
	out, err := exec.Command("sh", "-c", "ioreg -l | grep -m1 gpu-core-count").Output()
	if err != nil {
		return 0
	}
	// Line looks like:  | "gpu-core-count" = 16
	if i := strings.LastIndex(string(out), "="); i >= 0 {
		if n, err := strconv.Atoi(strings.TrimSpace(string(out)[i+1:])); err == nil {
			return n
		}
	}
	return 0
}
