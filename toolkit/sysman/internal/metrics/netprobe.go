package metrics

// Network quality probe. This file uses the *standard library* net package
// (Go scopes imports per-file, so metrics.go's gopsutil "net" is unaffected).

import (
	"net"
	"time"
)

// latencyTargets are well-known anycast endpoints. We estimate internet
// reachability + round-trip latency by timing a plain TCP connect to one of
// them — no root (unlike ICMP ping), no dependency, cross-platform. The connect
// handshake is ~one round trip, a good proxy for network latency.
var latencyTargets = []string{"1.1.1.1:443", "8.8.8.8:443"}

// MeasureLatency returns whether the internet is reachable and the best
// round-trip latency (ms) across the probe targets. online=false means none
// answered within the timeout (offline, or all targets blocked).
func MeasureLatency() (online bool, ms float64) {
	best := -1.0
	for _, t := range latencyTargets {
		start := time.Now()
		c, err := net.DialTimeout("tcp", t, 1500*time.Millisecond)
		if err != nil {
			continue
		}
		_ = c.Close()
		d := float64(time.Since(start).Microseconds()) / 1000
		if best < 0 || d < best {
			best = d
		}
	}
	if best < 0 {
		return false, 0
	}
	return true, best
}

// primaryIP returns the most likely primary interface and its IPv4 config: the
// first up, non-loopback interface carrying a usable (non-link-local) IPv4,
// along with the subnet prefix length (e.g. 24) and dotted mask (255.255.255.0).
// Best-effort — zero values when nothing qualifies. No network I/O.
func primaryIP() (iface, ip string, maskBits int, mask string) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "", "", 0, ""
	}
	for _, in := range ifaces {
		if in.Flags&net.FlagUp == 0 || in.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := in.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			v4 := ipn.IP.To4()
			if v4 == nil || v4.IsLinkLocalUnicast() || v4.IsLoopback() {
				continue
			}
			m := ipn.Mask
			if len(m) == 16 { // IPv4-in-IPv6 mask → take the v4 bytes
				m = m[12:]
			}
			ones, _ := m.Size()
			return in.Name, v4.String(), ones, net.IP(m).String()
		}
	}
	return "", "", 0, ""
}
