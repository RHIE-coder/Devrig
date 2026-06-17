package metrics

import (
	"strings"
	"testing"
	"time"
)

// TestClassifyTemp locks the sensor-key → group mapping across the platforms we
// care about: Apple Silicon ("PMU tdie3"), Intel SMC ("TC0D"/"TG0P"), Linux
// hwmon ("coretemp_core0", "k10temp", "nvme") and the battery/storage cases.
func TestClassifyTemp(t *testing.T) {
	cases := map[string]string{
		"PMU tdie3":         "CPU/SoC", // Apple Silicon die
		"TC0D":              "CPU/SoC", // Intel SMC CPU diode
		"coretemp_core0":    "CPU/SoC", // Linux hwmon
		"k10temp Tctl":      "CPU/SoC", // AMD
		"TG0P":              "GPU",     // Intel SMC GPU proximity
		"amdgpu edge":       "GPU",
		"gas gauge battery": "Battery",
		"NAND CH0 temp":     "Storage",
		"nvme Composite":    "Storage",
		"PMU tcal":          "", // calibration reference — peak only, no group
		"something else":    "",
	}
	for key, want := range cases {
		if got := classifyTemp(key); got != want {
			t.Errorf("classifyTemp(%q) = %q, want %q", key, got, want)
		}
	}
}

func TestHumanBytes(t *testing.T) {
	cases := map[uint64]string{
		0:                                "0 B",
		512:                              "512 B",
		1024:                             "1.0 K",
		1536:                             "1.5 K",
		1024 * 1024:                      "1.0 M",
		3*1024*1024*1024 + 512*1024*1024: "3.5 G",
	}
	for in, want := range cases {
		if got := humanBytes(in); got != want {
			t.Errorf("humanBytes(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestPerSecHandlesCounterReset(t *testing.T) {
	if got := perSec(2000, 1000, 2); got != 500 {
		t.Errorf("perSec normal = %v, want 500", got)
	}
	// A counter that went backwards (reboot / interface reset) must not yield a
	// huge negative or wrapped rate.
	if got := perSec(50, 1000, 2); got != 0 {
		t.Errorf("perSec on reset = %v, want 0", got)
	}
}

// TestDeriveRates checks the net/disk per-second rates are computed from the gap
// between two snapshots, and that the first sample (no prev) reports zero.
func TestDeriveRates(t *testing.T) {
	base := time.Now()
	prev := &Snapshot{At: base, NetSent: 1000, NetRecv: 2000, DiskRead: 4000, DiskWrite: 8000}
	cur := Snapshot{
		At:      base.Add(2 * time.Second),
		NetSent: 3000, NetRecv: 2000, // sent +2000 over 2s = 1000/s; recv unchanged
		DiskRead: 4000, DiskWrite: 16000, // write +8000 over 2s = 4000/s
	}
	cur.deriveRates(prev)
	if cur.NetSentRate != 1000 {
		t.Errorf("NetSentRate = %v, want 1000", cur.NetSentRate)
	}
	if cur.NetRecvRate != 0 {
		t.Errorf("NetRecvRate = %v, want 0", cur.NetRecvRate)
	}
	if cur.DiskWriteRate != 4000 {
		t.Errorf("DiskWriteRate = %v, want 4000", cur.DiskWriteRate)
	}

	// No prev → rates stay zero (first sample primes the baseline).
	first := Snapshot{At: base, NetSent: 5000}
	first.deriveRates(nil)
	if first.NetSentRate != 0 {
		t.Errorf("first-sample NetSentRate = %v, want 0", first.NetSentRate)
	}
}

// TestViewRendersSnapshot drives a snapshot into the model and asserts the
// section labels and the grouped temperature show up.
func TestViewRendersSnapshot(t *testing.T) {
	m := New()
	m.SetSize(120, 30)
	m, _ = m.Update(snapshotMsg(Snapshot{
		CPUPercent: 12.5, Cores: 8, PerCPU: []float64{10, 20, 5, 0, 80, 30, 15, 2},
		MemTotal: 16 << 30, MemUsed: 8 << 30, MemPercent: 50,
		SwapTotal: 4 << 30, SwapUsed: 1 << 30, SwapPercent: 25,
		TempSupported: true,
		Temps:         []TempGroup{{Label: "CPU/SoC", Avg: 46, Max: 48, Count: 11}},
		TempPeakKey:   "PMU tdie4", TempPeakC: 48,
	}))
	out := m.View()
	for _, want := range []string{"CPU", "MEM", "SWP", "NET", "DSK", "TMP", "CPU/SoC", "PMU tdie4"} {
		if !strings.Contains(out, want) {
			t.Errorf("metrics view missing %q in:\n%s", want, out)
		}
	}
}

// TestViewTempFallback verifies a sensor-less machine renders the friendly
// "not supported" line rather than an empty/temperature section.
func TestViewTempFallback(t *testing.T) {
	m := New()
	m.SetSize(100, 24)
	m, _ = m.Update(snapshotMsg(Snapshot{Cores: 4, TempSupported: false}))
	if out := m.View(); !strings.Contains(out, "온도 센서를 읽을 수 없습니다") {
		t.Errorf("expected temp fallback message, got:\n%s", out)
	}
}

// TestSpecBlockRenders drives a populated spec into the view and checks the
// hardware header — including the Apple-Silicon P/E core split — shows up.
func TestSpecBlockRenders(t *testing.T) {
	m := New()
	m.SetSize(140, 30)
	m, _ = m.Update(snapshotMsg(Snapshot{Cores: 10})) // loaded=true so View renders
	m, _ = m.Update(specMsg(Spec{
		Hostname: "mac.local", Model: "Mac14,9", CPUModel: "Apple M2 Pro",
		LogicalCPU: 10, PhysicalCPU: 10, PerfCores: 6, EffCores: 4, GPUCores: 16,
		CPUMHz: 3504, MemTotal: 16 << 30, DiskTotal: 994 << 30, DiskFstype: "apfs",
		OS: "macOS 26.0.1", Arch: "arm64",
	}))
	out := m.View()
	for _, want := range []string{"mac.local", "Mac14,9", "Apple M2 Pro", "10코어 (6P+4E)", "GPU 16코어", "RAM", "apfs", "macOS 26.0.1", "arm64"} {
		if !strings.Contains(out, want) {
			t.Errorf("spec block missing %q in:\n%s", want, out)
		}
	}
}

// TestCoresDescFallbacks checks the non-Apple-Silicon core descriptions: a plain
// logical count, and the logical/physical split when SMT is present.
func TestCoresDescFallbacks(t *testing.T) {
	plain := Model{spec: Spec{LogicalCPU: 8}}
	if got := plain.coresDesc(); got != "8코어" {
		t.Errorf("coresDesc plain = %q, want %q", got, "8코어")
	}
	smt := Model{spec: Spec{LogicalCPU: 16, PhysicalCPU: 8}}
	if got := smt.coresDesc(); !strings.Contains(got, "물리 8") {
		t.Errorf("coresDesc with SMT = %q, want it to note physical cores", got)
	}
}

// TestHostLineRenders checks the device-level line: total powered-on time, boot
// time, and the battery readout with its Korean state label.
func TestHostLineRenders(t *testing.T) {
	m := New()
	m.SetSize(140, 30)
	m, _ = m.Update(snapshotMsg(Snapshot{
		Cores: 8, UptimeSec: 90061, BootTimeUnix: 1777555571,
		BatteryPresent: true, BatteryPercent: 87, BatteryState: "discharging",
	}))
	out := m.View()
	for _, want := range []string{"가동", "1d 1h 1m 1s", "부팅", "배터리 87%", "방전 중"} {
		if !strings.Contains(out, want) {
			t.Errorf("host line missing %q in:\n%s", want, out)
		}
	}
}

// TestBatteryHealthRenders checks the battery health (수명) segment shows the
// max-capacity %, cycle count and translated condition.
func TestBatteryHealthRenders(t *testing.T) {
	m := New()
	m.SetSize(160, 30)
	m, _ = m.Update(snapshotMsg(Snapshot{Cores: 8, UptimeSec: 3600, BatteryPresent: true, BatteryPercent: 60, BatteryState: "charging"}))
	// Battery health arrives via its own (slower) message, like in production.
	m, _ = m.Update(healthMsg{pct: 86, cycles: 246, condition: "Normal"})
	out := m.View()
	for _, want := range []string{"수명 86%", "246회", "정상"} {
		if !strings.Contains(out, want) {
			t.Errorf("battery health missing %q in:\n%s", want, out)
		}
	}
}

// TestHealthSurvivesSpecRace verifies the two async loads don't clobber each
// other: when battery health lands before the spec, the (health-free) spec must
// not wipe it.
func TestHealthSurvivesSpecRace(t *testing.T) {
	m := New()
	m, _ = m.Update(healthMsg{pct: 90, cycles: 100, condition: "Normal"})
	m, _ = m.Update(specMsg(Spec{CPUModel: "Apple M2 Pro", LogicalCPU: 10}))
	if m.spec.BatteryMaxCapacityPct != 90 || m.spec.BatteryCycles != 100 {
		t.Errorf("spec load clobbered battery health: pct=%d cycles=%d", m.spec.BatteryMaxCapacityPct, m.spec.BatteryCycles)
	}
	if m.spec.CPUModel != "Apple M2 Pro" {
		t.Error("spec fields should still apply")
	}
}

// TestStateForPublishing verifies the model exposes its live reading (spec +
// snapshot) for the focus state file once loaded, and nil before.
func TestStateForPublishing(t *testing.T) {
	m := New()
	if m.State() != nil {
		t.Error("State should be nil before the first sample")
	}
	m, _ = m.Update(snapshotMsg(Snapshot{Cores: 8, CPUPercent: 42}))
	if m.State() == nil {
		t.Error("State should be non-nil after a sample")
	}
}

func TestLatencyQuality(t *testing.T) {
	cases := map[float64]string{10: "아주 빠름", 50: "좋음", 120: "보통", 300: "느림"}
	for ms, want := range cases {
		if got, _ := latencyQuality(ms); got != want {
			t.Errorf("latencyQuality(%.0f) = %q, want %q", ms, got, want)
		}
	}
}

// TestNetQualityLine checks the NET row reflects connectivity state: a "확인 중"
// placeholder before the first probe, an online line with latency+grade+IP, and
// an offline line.
func TestNetQualityLine(t *testing.T) {
	m := New()
	m.SetSize(140, 30)
	m, _ = m.Update(snapshotMsg(Snapshot{Cores: 8, NetIface: "en0", NetIP: "192.168.0.5", NetMaskBits: 24, NetMask: "255.255.255.0"}))
	if out := m.View(); !strings.Contains(out, "연결 확인 중") {
		t.Errorf("expected 'connecting' placeholder before first probe:\n%s", out)
	}

	m, _ = m.Update(latencyMsg{online: true, ms: 12})
	out := m.View()
	for _, want := range []string{"온라인", "지연 12ms", "아주 빠름", "en0 192.168.0.5/24", "마스크 255.255.255.0"} {
		if !strings.Contains(out, want) {
			t.Errorf("online NET line missing %q in:\n%s", want, out)
		}
	}

	m, _ = m.Update(latencyMsg{online: false})
	if out := m.View(); !strings.Contains(out, "오프라인") {
		t.Errorf("expected offline indicator:\n%s", out)
	}
}

func TestBatteryStateKO(t *testing.T) {
	cases := map[string]string{
		"charging": "충전 중", "discharging": "방전 중",
		"charged": "완충", "ac": "AC", "weird": "weird",
	}
	for in, want := range cases {
		if got := batteryStateKO(in); got != want {
			t.Errorf("batteryStateKO(%q) = %q, want %q", in, got, want)
		}
	}
}

// TestNoBatteryOmitsLine verifies a battery-less device doesn't render a battery
// segment (no "배터리" text), while still showing uptime.
func TestNoBatteryOmitsLine(t *testing.T) {
	m := New()
	m.SetSize(120, 26)
	m, _ = m.Update(snapshotMsg(Snapshot{Cores: 4, UptimeSec: 3600, BatteryPresent: false}))
	out := m.View()
	if strings.Contains(out, "배터리") {
		t.Errorf("battery-less device should not render a battery segment:\n%s", out)
	}
	if !strings.Contains(out, "가동") {
		t.Error("uptime should still render without a battery")
	}
}

// TestGatherSpec sanity-checks the live spec read on the host running the test:
// the cross-platform fields must always populate.
func TestGatherSpec(t *testing.T) {
	sp := GatherSpec()
	if sp.LogicalCPU <= 0 {
		t.Errorf("LogicalCPU = %d, want > 0", sp.LogicalCPU)
	}
	if sp.MemTotal == 0 {
		t.Error("MemTotal should be non-zero")
	}
	if sp.OS == "" {
		t.Error("OS label should be set")
	}
}
