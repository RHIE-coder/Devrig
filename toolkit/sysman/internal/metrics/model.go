package metrics

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/rhie-coder/devrig/toolkit/sysman/internal/timefmt"
)

// refreshInterval controls how often the metrics are re-sampled. One second is
// frequent enough to feel live while keeping the per-tick cost (sensors, disk,
// net) modest.
const refreshInterval = 1 * time.Second

type (
	snapshotMsg Snapshot
	specMsg     Spec
	healthMsg   struct {
		pct, cycles int
		condition   string
	}
	latencyMsg struct {
		online bool
		ms     float64
	}
	tickMsg time.Time
)

// netProbeEveryTicks rate-limits the connectivity/latency probe: with a 1s tick
// it runs every ~8s, so the outbound TCP connect doesn't fire every second.
const netProbeEveryTicks = 8

// Model is the device status view (shown to users as the "System" tab). It
// holds the static hardware spec (gathered once) plus the latest live snapshot,
// feeding the snapshot back as prev on the next sample so rates can be diffed.
type Model struct {
	width, height int
	spec          Spec
	specLoaded    bool
	snap          Snapshot
	loaded        bool

	// Network connectivity/latency, measured by a separate periodic probe.
	netProbed    bool
	netOnline    bool
	netLatencyMs float64
	ticks        int
}

// New builds the device status view.
func New() Model { return Model{} }

// Init reads the static spec once, kicks off the (slower) battery-health read,
// takes the first live sample (priming the CPU/rate baselines) and starts the
// refresh ticker.
func (m Model) Init() tea.Cmd {
	return tea.Batch(loadSpec(), loadHealth(), probeLatency(), m.load(), tick())
}

// probeLatency measures internet connectivity + round-trip latency off the UI
// thread. It opens a short-lived TCP connection to a well-known anycast host
// (see netprobe.go) — the only outbound traffic sysman makes.
func probeLatency() tea.Cmd {
	return func() tea.Msg {
		online, ms := MeasureLatency()
		return latencyMsg{online: online, ms: ms}
	}
}

func loadSpec() tea.Cmd {
	return func() tea.Msg { return specMsg(GatherSpec()) }
}

// loadHealth reads battery health separately from the fast spec because its
// source (system_profiler on macOS) can take ~1s; the spec header shows
// immediately and the health fills in shortly after.
func loadHealth() tea.Cmd {
	return func() tea.Msg {
		pct, cycles, cond := GatherBatteryHealth()
		return healthMsg{pct: pct, cycles: cycles, condition: cond}
	}
}

// State returns the live device reading (static spec + latest snapshot) for the
// focus state file, so external tools (Claude/Codex) can answer about the System
// view the user is actually looking at. nil until the first sample lands.
func (m Model) State() any {
	if !m.loaded {
		return nil
	}
	return struct {
		Spec Spec `json:"spec"`
		Snapshot
		NetOnline    bool    `json:"net_online"`
		NetLatencyMs float64 `json:"net_latency_ms"`
	}{m.spec, m.snap, m.netOnline, m.netLatencyMs}
}

// SetSize records the body area so the view can lay out and pad to it.
func (m *Model) SetSize(w, h int) { m.width, m.height = w, h }

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case specMsg:
		// Preserve any battery-health fields already merged in (the two loads
		// race; whichever lands second must not clobber the other).
		health := struct {
			pct, cycles int
			cond        string
		}{m.spec.BatteryMaxCapacityPct, m.spec.BatteryCycles, m.spec.BatteryCondition}
		m.spec = Spec(msg)
		m.spec.BatteryMaxCapacityPct, m.spec.BatteryCycles, m.spec.BatteryCondition = health.pct, health.cycles, health.cond
		m.specLoaded = true
		return m, nil
	case healthMsg:
		m.spec.BatteryMaxCapacityPct = msg.pct
		m.spec.BatteryCycles = msg.cycles
		m.spec.BatteryCondition = msg.condition
		return m, nil
	case latencyMsg:
		m.netProbed = true
		m.netOnline = msg.online
		m.netLatencyMs = msg.ms
		return m, nil
	case snapshotMsg:
		m.snap = Snapshot(msg)
		m.loaded = true
		return m, nil
	case tickMsg:
		m.ticks++
		cmds := []tea.Cmd{m.load(), tick()}
		if m.ticks%netProbeEveryTicks == 0 {
			cmds = append(cmds, probeLatency())
		}
		return m, tea.Batch(cmds...)
	case tea.KeyMsg:
		if msg.String() == "r" {
			return m, m.load()
		}
	}
	return m, nil
}

// load samples the next snapshot, diffing against the current one for rates.
func (m Model) load() tea.Cmd {
	var prev *Snapshot
	if m.loaded {
		p := m.snap
		prev = &p
	}
	return func() tea.Msg { return snapshotMsg(Gather(prev)) }
}

// Detail is the line the parent shell renders under the body.
func (m Model) Detail() string {
	if !m.loaded {
		return faintStyle.Render("측정 중…")
	}
	return faintStyle.Render(fmt.Sprintf("[r] 새로고침 · %s 마다 자동 갱신", refreshInterval))
}

// hostLine shows the live, device-level facts that sit above the per-subsystem
// metrics: how long the machine has been powered on, when it booted, and the
// battery (laptops only).
func (m Model) hostLine(s Snapshot) string {
	parts := descStyle.Render("가동 " + timefmt.Full(time.Duration(s.UptimeSec)*time.Second))
	if s.BootTimeUnix > 0 {
		parts += faintStyle.Render("  ·  부팅 " + time.Unix(int64(s.BootTimeUnix), 0).Format("2006-01-02 15:04"))
	}
	if s.BatteryPresent {
		parts += faintStyle.Render("  ·  ") + batterySeg(s)
	}
	if h := m.spec.BatteryMaxCapacityPct; h > 0 {
		seg := fmt.Sprintf("수명 %d%%", h) // max capacity vs design
		if m.spec.BatteryCycles > 0 {
			seg += fmt.Sprintf(" (%d회", m.spec.BatteryCycles)
			if c := conditionKO(m.spec.BatteryCondition); c != "" {
				seg += " · " + c
			}
			seg += ")"
		}
		parts += faintStyle.Render("  ·  " + seg)
	}
	return specKeyStyle.Render(" UP   ") + " " + parts
}

// conditionKO translates macOS's battery "Condition" to Korean.
func conditionKO(c string) string {
	switch strings.ToLower(strings.TrimSpace(c)) {
	case "":
		return ""
	case "normal":
		return "정상"
	case "service recommended", "service":
		return "교체 권장"
	default:
		return c
	}
}

// batterySeg renders "배터리 87% 방전 중", colored by charge level (low = warning).
func batterySeg(s Snapshot) string {
	txt := fmt.Sprintf("배터리 %d%%", s.BatteryPercent)
	if ko := batteryStateKO(s.BatteryState); ko != "" {
		txt += " " + ko
	}
	return batteryStyle(s.BatteryPercent).Render(txt)
}

func batteryStateKO(state string) string {
	switch state {
	case "charging":
		return "충전 중"
	case "discharging":
		return "방전 중"
	case "charged":
		return "완충"
	case "ac":
		return "AC"
	default:
		return state
	}
}

func batteryStyle(pct int) lipgloss.Style {
	switch {
	case pct >= 0 && pct < 20:
		return lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("196"))
	case pct < 50:
		return lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	default:
		return lipgloss.NewStyle().Foreground(lipgloss.Color("78"))
	}
}

func (m Model) View() string {
	if !m.loaded {
		return m.fit(descStyle.Render("  측정 중…"))
	}
	s := m.snap
	var b strings.Builder

	// — Hardware spec (static) + live host line (uptime/boot/battery) —
	// Each header row is separated by a blank line so the labelled badges
	// (CHIP/SPEC/UP) read as distinct rows instead of one merged colored block.
	b.WriteString(m.specBlock() + "\n\n")
	b.WriteString(m.hostLine(s) + "\n\n")
	b.WriteString(dividerStyle.Render(strings.Repeat("─", clampWidth(m.width))) + "\n")

	// Each subsystem is a "row": a colored left rail (alternating shade) groups
	// its lines and separates it from the next.
	stripe := 0
	emit := func(lines ...string) {
		b.WriteString(rail(stripe, lines) + "\n")
		stripe++
	}

	// CPU.
	cpu := []string{
		sectionStyle.Render("CPU") + "  " + m.gauge(s.CPUPercent) +
			valueStyle.Render(fmt.Sprintf(" %5.1f%%", s.CPUPercent)) +
			faintStyle.Render(fmt.Sprintf("  ·  %d코어", s.Cores)),
	}
	if len(s.PerCPU) > 0 {
		cpu = append(cpu, "      "+faintStyle.Render("코어별 ")+sparkline(s.PerCPU))
	}
	if extra := m.cpuExtra(s); extra != "" {
		cpu = append(cpu, "      "+faintStyle.Render(extra))
	}
	emit(cpu...)

	// Memory (+ breakdown + swap).
	mem := []string{
		sectionStyle.Render("MEM") + "  " + m.gauge(s.MemPercent) +
			valueStyle.Render(fmt.Sprintf(" %5.1f%%", s.MemPercent)) +
			descStyle.Render(fmt.Sprintf("  %s / %s", humanBytes(s.MemUsed), humanBytes(s.MemTotal))) +
			faintStyle.Render(fmt.Sprintf("  ·  가용 %s", humanBytes(s.MemAvailable))),
	}
	if s.MemWired > 0 || s.MemActive > 0 || s.MemInactive > 0 {
		mem = append(mem, "      "+faintStyle.Render(fmt.Sprintf("고정(wired) %s · 사용중(active) %s · 재사용가능(inactive) %s",
			humanBytes(s.MemWired), humanBytes(s.MemActive), humanBytes(s.MemInactive))))
	}
	if s.SwapTotal > 0 {
		mem = append(mem, sectionStyle.Render("SWP")+"  "+m.gauge(s.SwapPercent)+
			valueStyle.Render(fmt.Sprintf(" %5.1f%%", s.SwapPercent))+
			descStyle.Render(fmt.Sprintf("  %s / %s", humanBytes(s.SwapUsed), humanBytes(s.SwapTotal)))+
			faintStyle.Render("  ·  RAM 부족분을 디스크로"))
	} else {
		mem = append(mem, sectionStyle.Render("SWP")+"  "+faintStyle.Render("스왑 없음"))
	}
	emit(mem...)

	// Network: connectivity/quality on top, throughput below.
	emit(
		sectionStyle.Render("NET")+"  "+m.netQualityLine(s),
		"      "+descStyle.Render(fmt.Sprintf("↑ 업로드 %s/s    ↓ 다운로드 %s/s", humanBytes(uint64(s.NetSentRate)), humanBytes(uint64(s.NetRecvRate))))+
			faintStyle.Render(fmt.Sprintf("    ·  누적 ↑%s ↓%s", humanBytes(s.NetSent), humanBytes(s.NetRecv))),
	)

	// Disk.
	emit(sectionStyle.Render("DSK") + "  " + m.gauge(s.DiskPercent) +
		valueStyle.Render(fmt.Sprintf(" %5.1f%%", s.DiskPercent)) +
		descStyle.Render(fmt.Sprintf("  %s / %s", humanBytes(s.DiskUsed), humanBytes(s.DiskTotal))) +
		faintStyle.Render(fmt.Sprintf("   ·  읽기 %s/s 쓰기 %s/s · IOPS r%.0f w%.0f",
			humanBytes(uint64(s.DiskReadRate)), humanBytes(uint64(s.DiskWriteRate)), s.DiskReadOpsRate, s.DiskWriteOpsRate)))

	// Temperature.
	emit(m.tempLine(s))

	return m.fit(b.String())
}

// cpuExtra is the secondary CPU line: load average and the process counts, with
// plain-language labels (running/blocked are jargon — see the 'h' help).
func (m Model) cpuExtra(s Snapshot) string {
	var parts []string
	if s.Load1 > 0 || s.Load5 > 0 || s.Load15 > 0 {
		parts = append(parts, fmt.Sprintf("부하(load) %.2f %.2f %.2f", s.Load1, s.Load5, s.Load15))
	}
	if s.ProcsTotal > 0 {
		p := fmt.Sprintf("프로세스 %d", s.ProcsTotal)
		if s.ProcsRunning > 0 || s.ProcsBlocked > 0 {
			p += fmt.Sprintf(" (실행 %d · I/O대기 %d)", s.ProcsRunning, s.ProcsBlocked)
		}
		parts = append(parts, p)
	}
	return strings.Join(parts, "   ·   ")
}

// netQualityLine summarizes connection health — online/offline, round-trip
// latency and a plain-language quality grade — plus the primary interface/IP, so
// the NET row answers "is my connection good?" not just "how many bytes/sec".
func (m Model) netQualityLine(s Snapshot) string {
	var head string
	switch {
	case !m.netProbed:
		head = faintStyle.Render("연결 확인 중…")
	case !m.netOnline:
		head = offlineStyle.Render("● 오프라인") + faintStyle.Render(" (인터넷에 연결되지 않음)")
	default:
		label, color := latencyQuality(m.netLatencyMs)
		head = onlineStyle.Render("●") + descStyle.Render(" 온라인") +
			faintStyle.Render(fmt.Sprintf("  ·  지연 %.0fms ", m.netLatencyMs)) +
			lipgloss.NewStyle().Bold(true).Foreground(color).Render("("+label+")")
	}
	if s.NetIP != "" {
		host := s.NetIP
		if s.NetMaskBits > 0 {
			host += fmt.Sprintf("/%d", s.NetMaskBits) // CIDR prefix
		}
		if s.NetIface != "" {
			host = s.NetIface + " " + host
		}
		if s.NetMask != "" {
			host += " (마스크 " + s.NetMask + ")"
		}
		head += faintStyle.Render("   ·  " + host)
	}
	return head
}

// latencyQuality grades a round-trip latency (ms) for a non-expert: lower is
// better. The thresholds suit a TCP connect to a nearby CDN edge.
func latencyQuality(ms float64) (string, lipgloss.Color) {
	switch {
	case ms < 30:
		return "아주 빠름", lipgloss.Color("78")
	case ms < 80:
		return "좋음", lipgloss.Color("78")
	case ms < 150:
		return "보통", lipgloss.Color("214")
	default:
		return "느림", lipgloss.Color("208")
	}
}

// tempLine renders the temperature row: each group's current average (colored by
// the group's hottest sensor) plus the single hottest sensor right now. These
// are live readings, not limits.
func (m Model) tempLine(s Snapshot) string {
	head := sectionStyle.Render("TMP") + "  "
	if !s.TempSupported {
		return head + faintStyle.Render("이 장비에서는 온도 센서를 읽을 수 없습니다")
	}
	parts := make([]string, 0, len(s.Temps))
	for _, g := range s.Temps {
		seg := descStyle.Render(g.Label+" ") + tempStyle(g.Max).Render(fmt.Sprintf("%.0f°", g.Avg))
		if g.Count > 1 {
			seg += faintStyle.Render(fmt.Sprintf(" (%d센서 평균)", g.Count))
		}
		parts = append(parts, seg)
	}
	out := head + strings.Join(parts, descStyle.Render("   "))
	if s.TempPeakKey != "" {
		out += faintStyle.Render(fmt.Sprintf("   ·  최고온 %s %.0f°", s.TempPeakKey, s.TempPeakC))
	}
	return out
}

// specBlock renders the static hardware/OS summary shown above the live
// metrics. Fields a platform doesn't provide (P/E split, GPU, model) are simply
// omitted so the line stays clean everywhere.
func (m Model) specBlock() string {
	if !m.specLoaded {
		return faintStyle.Render(" 장치 정보 읽는 중…")
	}
	sp := m.spec

	title := hostStyle.Render(" " + firstNonEmpty(sp.Hostname, "this device"))
	if sp.Model != "" {
		title += faintStyle.Render("  ·  " + sp.Model)
	}

	chip := descStyle.Render(firstNonEmpty(sp.CPUModel, "CPU")) + faintStyle.Render("  ·  "+m.coresDesc())
	if sp.GPUCores > 0 {
		chip += faintStyle.Render(fmt.Sprintf("  ·  GPU %d코어", sp.GPUCores))
	}
	if sp.CPUMHz > 0 {
		chip += faintStyle.Render(fmt.Sprintf("  ·  %.2f GHz", sp.CPUMHz/1000))
	}

	disk := humanBytes(sp.DiskTotal)
	if sp.DiskFstype != "" {
		disk += " (" + sp.DiskFstype + ")"
	}
	osLine := sp.OS
	if sp.Arch != "" {
		osLine += " · " + sp.Arch
	}
	info := descStyle.Render(fmt.Sprintf("RAM %s", humanBytes(sp.MemTotal))) +
		faintStyle.Render("   ·   ") + descStyle.Render("Disk "+disk) +
		faintStyle.Render("   ·   ") + descStyle.Render("OS "+osLine)
	if sp.Virtualization != "" {
		info += faintStyle.Render("   ·   VM: " + sp.Virtualization)
	}

	// Rows joined by a blank line so the CHIP/SPEC badges don't merge visually.
	return strings.Join([]string{
		title,
		specKeyStyle.Render(" CHIP ") + " " + chip,
		specKeyStyle.Render(" SPEC ") + " " + info,
	}, "\n\n")
}

// coresDesc describes the core layout: the P/E split on Apple Silicon, the
// logical/physical split where they differ (e.g. x86 with SMT), or just the
// logical count.
func (m Model) coresDesc() string {
	sp := m.spec
	d := fmt.Sprintf("%d코어", sp.LogicalCPU)
	switch {
	case sp.PerfCores > 0 && sp.EffCores > 0:
		d += fmt.Sprintf(" (%dP+%dE)", sp.PerfCores, sp.EffCores)
	case sp.PhysicalCPU > 0 && sp.PhysicalCPU != sp.LogicalCPU:
		d += fmt.Sprintf(" (물리 %d)", sp.PhysicalCPU)
	}
	return d
}

// gauge renders a fixed-width bar for a 0..100 percentage: the filled portion in
// the threshold color, the empty track in a neutral gray so the bar reads
// clearly as "filled vs remaining" instead of looking like blank space.
func (m Model) gauge(pct float64) string {
	const width = 18
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	filled := int(pct/100*float64(width) + 0.5)
	return gaugeStyle(pct).Render(strings.Repeat("█", filled)) +
		gaugeBgStyle.Render(strings.Repeat("░", width-filled))
}

// fit clamps the rendered body to the available area: each line is clipped to
// the width (ANSI-aware) so nothing overflows horizontally, and the whole block
// is padded or truncated to exactly the body height so the parent's
// detail/footer rows stay anchored to the bottom (matching the table tabs).
func (m Model) fit(out string) string {
	lines := strings.Split(out, "\n")
	if m.width > 0 {
		clip := lipgloss.NewStyle().MaxWidth(m.width)
		for i := range lines {
			lines[i] = clip.Render(lines[i])
		}
	}
	if m.height > 0 {
		for len(lines) < m.height {
			lines = append(lines, "")
		}
		if len(lines) > m.height {
			lines = lines[:m.height]
		}
	}
	return strings.Join(lines, "\n")
}

// clampWidth bounds the divider/header rule width to a sane range.
func clampWidth(w int) int {
	if w < 1 {
		return 1
	}
	return w
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// sparkline renders one block char per core, its height scaled to that core's
// load, colored by the busiest core so a single pegged core stands out.
func sparkline(per []float64) string {
	levels := []rune(" ▁▂▃▄▅▆▇█")
	var sb strings.Builder
	var max float64
	for _, v := range per {
		if v > max {
			max = v
		}
		idx := int(v / 100 * float64(len(levels)-1))
		if idx < 0 {
			idx = 0
		}
		if idx >= len(levels) {
			idx = len(levels) - 1
		}
		sb.WriteRune(levels[idx])
	}
	return gaugeStyle(max).Render(sb.String())
}

func tick() tea.Cmd {
	return tea.Tick(refreshInterval, func(t time.Time) tea.Msg { return tickMsg(t) })
}

// humanBytes renders a byte count with a binary unit and one decimal: "13.6 G",
// "812 K", "0 B". Used for both totals and (truncated) per-second rates.
func humanBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %c", float64(b)/float64(div), "KMGTPE"[exp])
}

// thresholdColor maps a 0..100 value to green/yellow/red.
func thresholdColor(pct float64) lipgloss.Color {
	switch {
	case pct >= 85:
		return lipgloss.Color("196") // red
	case pct >= 60:
		return lipgloss.Color("214") // yellow
	default:
		return lipgloss.Color("78") // green
	}
}

func gaugeStyle(pct float64) lipgloss.Style {
	return lipgloss.NewStyle().Foreground(thresholdColor(pct))
}

// rail prefixes each line of a section with a colored left bar so each subsystem
// reads as its own row. The bar's shade alternates per section, giving adjacent
// rows a distinct look. (A full-width background was the obvious choice, but
// terminals drop a background across the inner color resets of multi-colored
// text — the bar is on its own span, so it always renders.)
func rail(stripe int, lines []string) string {
	c := lipgloss.Color("67") // steel blue
	if stripe%2 == 1 {
		c = lipgloss.Color("98") // muted violet
	}
	bar := lipgloss.NewStyle().Foreground(c).Render("▌")
	out := make([]string, len(lines))
	for i, ln := range lines {
		out[i] = bar + " " + ln
	}
	return strings.Join(out, "\n")
}

// tempStyle colors a temperature reading: warm/hot thresholds in °C.
func tempStyle(c float64) lipgloss.Style {
	switch {
	case c >= 85:
		return lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("196"))
	case c >= 70:
		return lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	default:
		return lipgloss.NewStyle().Foreground(lipgloss.Color("78"))
	}
}

var (
	sectionStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("81"))  // bright cyan label
	valueStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("231")) // bright white value
	descStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))            // primary text — readable
	// faintStyle is the secondary text. It is deliberately NOT lipgloss Faint:
	// the Faint attribute on a dim gray was nearly invisible on dark terminals.
	faintStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	gaugeBgStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240")) // gauge empty track
	dividerStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))

	// Network connectivity status.
	onlineStyle  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("78"))
	offlineStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("196"))

	// Hardware spec header.
	hostStyle    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("231"))
	specKeyStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("60"))
)
