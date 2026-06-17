// Package metrics implements the Metrics view: a live, cross-platform snapshot
// of device health — CPU (total + per-core), memory and swap, network and disk
// throughput, hardware temperatures, load average and uptime.
//
// All readings come from gopsutil (already a dependency), so the same code runs
// on macOS, Linux and Windows. Hardware temperatures are the one capability
// that isn't universal: on Apple Silicon they are read (without sudo) through
// the IOHIDEventSystemClient API, on Intel Macs through the SMC, on Linux from
// hwmon, and on Windows via WMI — and on machines/VMs with no sensors the
// Temps slice is simply empty (TempSupported is false), which the view renders
// as "not supported" rather than an error.
package metrics

import (
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/sensors"
)

// Snapshot is one point-in-time reading of every metric. Cumulative counters
// (NetSent/Recv, DiskRead/Write) and At are carried so the next Gather can
// derive per-second rates by diffing against the previous Snapshot. Shared by
// the TUI and the `--json metrics` headless mode.
type Snapshot struct {
	At time.Time `json:"-"` // capture time, used only to compute rates

	// CPU.
	CPUPercent float64   `json:"cpu_percent"`       // total busy %, 0..100
	PerCPU     []float64 `json:"per_cpu,omitempty"` // per logical core, 0..100
	Cores      int       `json:"cores"`             // logical core count
	Load1      float64   `json:"load1"`             // load averages (0 where unsupported, e.g. Windows)
	Load5      float64   `json:"load5"`
	Load15     float64   `json:"load15"`

	// Processes.
	ProcsTotal   int `json:"procs_total"`   // processes the kernel reports
	ProcsRunning int `json:"procs_running"` // currently runnable (0 where unsupported)
	ProcsBlocked int `json:"procs_blocked"` // blocked on I/O (0 where unsupported)

	// Memory + swap (bytes). The Wired/Active/Inactive breakdown is populated
	// where the OS exposes it (macOS, Linux); it stays zero elsewhere.
	MemTotal     uint64  `json:"mem_total"`
	MemUsed      uint64  `json:"mem_used"`
	MemAvailable uint64  `json:"mem_available"`
	MemPercent   float64 `json:"mem_percent"`
	MemWired     uint64  `json:"mem_wired,omitempty"`
	MemActive    uint64  `json:"mem_active,omitempty"`
	MemInactive  uint64  `json:"mem_inactive,omitempty"`
	SwapTotal    uint64  `json:"swap_total"`
	SwapUsed     uint64  `json:"swap_used"`
	SwapPercent  float64 `json:"swap_percent"`

	// Network: cumulative bytes since boot + derived per-second rate, plus the
	// primary interface/IP. (Connectivity + latency are measured by a separate
	// probe — see the model's net fields and MeasureLatency.)
	NetSent     uint64  `json:"net_sent_total"`
	NetRecv     uint64  `json:"net_recv_total"`
	NetSentRate float64 `json:"net_sent_rate"` // bytes/sec (0 on the first sample)
	NetRecvRate float64 `json:"net_recv_rate"`
	NetIface    string  `json:"net_iface,omitempty"`     // primary interface name (e.g. en0)
	NetIP       string  `json:"net_ip,omitempty"`        // primary local IPv4
	NetMaskBits int     `json:"net_mask_bits,omitempty"` // subnet prefix length (e.g. 24)
	NetMask     string  `json:"net_mask,omitempty"`      // dotted subnet mask (e.g. 255.255.255.0)

	// Disk: root-filesystem usage + aggregate IO throughput and operation rate.
	DiskTotal        uint64  `json:"disk_total"`
	DiskUsed         uint64  `json:"disk_used"`
	DiskPercent      float64 `json:"disk_percent"`
	DiskRead         uint64  `json:"disk_read_total"`
	DiskWrite        uint64  `json:"disk_write_total"`
	DiskReadRate     float64 `json:"disk_read_rate"`  // bytes/sec
	DiskWriteRate    float64 `json:"disk_write_rate"` // bytes/sec
	DiskReadOps      uint64  `json:"disk_read_ops_total"`
	DiskWriteOps     uint64  `json:"disk_write_ops_total"`
	DiskReadOpsRate  float64 `json:"disk_read_iops"`  // read operations/sec
	DiskWriteOpsRate float64 `json:"disk_write_iops"` // write operations/sec

	// Temperature, grouped into a few human labels (see classifyTemp). Empty
	// when the platform/hardware exposes no sensors.
	TempSupported bool        `json:"temp_supported"`
	Temps         []TempGroup `json:"temps,omitempty"`
	TempPeakKey   string      `json:"temp_peak_key,omitempty"` // hottest individual sensor
	TempPeakC     float64     `json:"temp_peak_c,omitempty"`

	UptimeSec    uint64 `json:"uptime_sec"`     // seconds since boot (total powered-on time)
	BootTimeUnix uint64 `json:"boot_time_unix"` // boot wall-clock (unix seconds)

	// Battery (laptops). Present is false on desktops/servers and where the OS
	// exposes no battery. State is one of charging/discharging/charged/ac.
	BatteryPresent bool   `json:"battery_present"`
	BatteryPercent int    `json:"battery_percent,omitempty"`
	BatteryState   string `json:"battery_state,omitempty"`

	batteryAt time.Time // when battery was last read (rate-limits the subprocess); not serialized
}

// TempGroup aggregates the raw sensor readings that map to one human label
// (e.g. the eleven "PMU tdie*" die sensors on an M-series chip collapse into a
// single "CPU/SoC" group).
type TempGroup struct {
	Label string  `json:"label"`
	Avg   float64 `json:"avg_c"`
	Max   float64 `json:"max_c"`
	Count int     `json:"count"`
}

// Gather reads every metric once. When prev is non-nil and a positive interval
// has elapsed, network/disk rates are computed from the counter deltas;
// otherwise the rate fields stay zero. Best-effort: any single reading that
// fails is left at its zero value rather than failing the whole snapshot, so a
// permission-restricted or sensor-less environment still shows what it can.
func Gather(prev *Snapshot) Snapshot {
	s := Snapshot{At: time.Now()}

	// CPU: per-core busy % since the previous Percent(0,…) call; the total is
	// their mean so the headline number and the per-core bars always agree.
	if per, err := cpu.Percent(0, true); err == nil && len(per) > 0 {
		s.PerCPU = per
		s.Cores = len(per)
		var sum float64
		for _, v := range per {
			sum += v
		}
		s.CPUPercent = sum / float64(len(per))
	}
	if la, err := load.Avg(); err == nil && la != nil {
		s.Load1, s.Load5, s.Load15 = la.Load1, la.Load5, la.Load15
	}
	if lm, err := load.Misc(); err == nil && lm != nil {
		s.ProcsRunning, s.ProcsBlocked = lm.ProcsRunning, lm.ProcsBlocked
	}

	if vm, err := mem.VirtualMemory(); err == nil && vm != nil {
		s.MemTotal, s.MemUsed = vm.Total, vm.Used
		s.MemAvailable, s.MemPercent = vm.Available, vm.UsedPercent
		s.MemWired, s.MemActive, s.MemInactive = vm.Wired, vm.Active, vm.Inactive
	}
	if sw, err := mem.SwapMemory(); err == nil && sw != nil {
		s.SwapTotal, s.SwapUsed, s.SwapPercent = sw.Total, sw.Used, sw.UsedPercent
	}

	if io, err := net.IOCounters(false); err == nil && len(io) > 0 {
		s.NetSent, s.NetRecv = io[0].BytesSent, io[0].BytesRecv
	}
	s.NetIface, s.NetIP, s.NetMaskBits, s.NetMask = primaryIP()

	if du, err := disk.Usage("/"); err == nil && du != nil {
		s.DiskTotal, s.DiskUsed, s.DiskPercent = du.Total, du.Used, du.UsedPercent
	}
	if ioc, err := disk.IOCounters(); err == nil {
		for _, c := range ioc {
			s.DiskRead += c.ReadBytes
			s.DiskWrite += c.WriteBytes
			s.DiskReadOps += c.ReadCount
			s.DiskWriteOps += c.WriteCount
		}
	}

	// host.Info gives uptime, boot time and the process count in one call.
	if hi, err := host.Info(); err == nil && hi != nil {
		s.UptimeSec = hi.Uptime
		s.BootTimeUnix = hi.BootTime
		s.ProcsTotal = int(hi.Procs)
	}

	s.readTemps()
	s.readBattery(prev)
	s.deriveRates(prev)
	return s
}

// readBattery fills the battery fields, reusing the previous reading unless it
// is older than batteryInterval. Battery state changes slowly, and reading it
// can mean spawning a subprocess (pmset on macOS), so polling it every tick
// would be wasteful — and would show this tool's own helper churning in the
// process list.
func (s *Snapshot) readBattery(prev *Snapshot) {
	const batteryInterval = 5 * time.Second
	if prev != nil && !prev.batteryAt.IsZero() && s.At.Sub(prev.batteryAt) < batteryInterval {
		s.BatteryPresent, s.BatteryPercent, s.BatteryState = prev.BatteryPresent, prev.BatteryPercent, prev.BatteryState
		s.batteryAt = prev.batteryAt
		return
	}
	if present, pct, state := readBattery(); present {
		s.BatteryPresent, s.BatteryPercent, s.BatteryState = true, pct, state
	}
	s.batteryAt = s.At
}

// deriveRates turns the cumulative counters into per-second rates using the gap
// since prev. Guards against counter resets (reboot, interface reset) by
// dropping negative deltas to zero.
func (s *Snapshot) deriveRates(prev *Snapshot) {
	if prev == nil {
		return
	}
	dt := s.At.Sub(prev.At).Seconds()
	if dt <= 0 {
		return
	}
	s.NetSentRate = perSec(s.NetSent, prev.NetSent, dt)
	s.NetRecvRate = perSec(s.NetRecv, prev.NetRecv, dt)
	s.DiskReadRate = perSec(s.DiskRead, prev.DiskRead, dt)
	s.DiskWriteRate = perSec(s.DiskWrite, prev.DiskWrite, dt)
	s.DiskReadOpsRate = perSec(s.DiskReadOps, prev.DiskReadOps, dt)
	s.DiskWriteOpsRate = perSec(s.DiskWriteOps, prev.DiskWriteOps, dt)
}

func perSec(cur, prev uint64, dt float64) float64 {
	if cur < prev { // counter reset
		return 0
	}
	return float64(cur-prev) / dt
}

// readTemps reads the raw sensors and folds them into labelled groups, tracking
// the single hottest sensor as the peak. Sensors reporting 0°C are ignored:
// gopsutil returns a 0 for keys that exist but have no live reading, and a real
// 0°C reading is not meaningful for this UI.
func (s *Snapshot) readTemps() {
	raw, err := sensors.SensorsTemperatures()
	if err != nil && len(raw) == 0 {
		return
	}
	type acc struct {
		sum float64
		max float64
		n   int
	}
	groups := map[string]*acc{}
	for _, t := range raw {
		if t.Temperature <= 0 {
			continue
		}
		s.TempSupported = true
		if t.Temperature > s.TempPeakC {
			s.TempPeakC, s.TempPeakKey = t.Temperature, t.SensorKey
		}
		label := classifyTemp(t.SensorKey)
		if label == "" {
			continue // counted in the peak, but not shown as its own group
		}
		a := groups[label]
		if a == nil {
			a = &acc{}
			groups[label] = a
		}
		a.sum += t.Temperature
		a.n++
		if t.Temperature > a.max {
			a.max = t.Temperature
		}
	}
	for _, label := range tempOrder {
		if a := groups[label]; a != nil {
			s.Temps = append(s.Temps, TempGroup{
				Label: label,
				Avg:   a.sum / float64(a.n),
				Max:   a.max,
				Count: a.n,
			})
		}
	}
}

// tempOrder fixes the display order of the known groups.
var tempOrder = []string{"CPU/SoC", "GPU", "Battery", "Storage"}

// classifyTemp maps a raw sensor key to one of the known groups, or "" if it
// doesn't match any (the key still contributes to the overall peak). Matching
// is deliberately broad so it works across Apple Silicon ("PMU tdie3"), Intel
// SMC ("TC0D"), Linux hwmon ("coretemp_core0", "k10temp", "nvme") and Windows.
func classifyTemp(key string) string {
	k := strings.ToLower(key)
	switch {
	case containsAny(k, "tdie", "tctl", "coretemp", "core temp", "cpu", "tc0", "package", "soc", "die temp"):
		return "CPU/SoC"
	case containsAny(k, "gpu", "radeon", "amdgpu", "nvidia", "tg0"):
		return "GPU"
	case containsAny(k, "battery", "gas gauge"):
		return "Battery"
	case containsAny(k, "nand", "nvme", "ssd", "disk", "th0"):
		return "Storage"
	}
	return ""
}

func containsAny(hay string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(hay, n) {
			return true
		}
	}
	return false
}

// SampleRates captures two snapshots spread by interval so the second carries
// real network/disk rates (and a settled CPU reading). It is for one-shot
// callers like the `--json metrics` headless mode; the live TUI instead diffs
// successive ticks.
func SampleRates(interval time.Duration) Snapshot {
	first := Gather(nil)
	time.Sleep(interval)
	return Gather(&first)
}
