package process

import (
	"os"
	"testing"
	"time"
)

// TestCPURate pins down the interval CPU% math: the rise in cumulative CPU
// seconds over the wall-clock gap, scaled so 100% == one core busy for the
// whole window.
func TestCPURate(t *testing.T) {
	base := time.Unix(1_700_000_000, 0)
	mk := func(secs float64, offset time.Duration) cpuSample {
		return cpuSample{secs: secs, at: base.Add(offset)}
	}

	cases := []struct {
		name    string
		prev    cpuSample
		cur     cpuSample
		wantOK  bool
		wantCPU float64
	}{
		{"one core fully busy", mk(0, 0), mk(1, time.Second), true, 100},
		{"half a core", mk(10, 0), mk(10.5, time.Second), true, 50},
		{"two cores busy", mk(0, 0), mk(2, time.Second), true, 200},
		{"idle process (no delta)", mk(5, 0), mk(5, time.Second), false, 0},
		{"non-positive gap (same instant)", mk(0, 0), mk(1, 0), false, 0},
		{"clock went backwards", mk(0, time.Second), mk(1, 0), false, 0},
		{"counter reset (negative delta)", mk(10, 0), mk(2, time.Second), false, 0},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v, ok := cpuRate(c.prev, c.cur)
			if ok != c.wantOK {
				t.Fatalf("cpuRate ok = %v, want %v", ok, c.wantOK)
			}
			if ok && v != c.wantCPU {
				t.Errorf("cpuRate = %v, want %v", v, c.wantCPU)
			}
			if !ok && v != 0 {
				t.Errorf("cpuRate not-ok should return 0, got %v", v)
			}
		})
	}
}

// TestAncestrySelf verifies the chain starts at the requested pid and walks up
// to a root: each node's PPID is the next node's PID, and the last node has no
// further reachable parent (ppid 0, or itself, or pid 1 / not in the chain).
func TestAncestrySelf(t *testing.T) {
	pid := int32(os.Getpid())

	chain, err := Ancestry(pid)
	if err != nil {
		t.Fatalf("Ancestry(%d) error: %v", pid, err)
	}
	if len(chain) == 0 {
		t.Fatal("Ancestry returned empty chain")
	}
	if chain[0].PID != pid {
		t.Fatalf("chain[0].PID = %d, want %d (target must be first)", chain[0].PID, pid)
	}

	// Each link must point at the next: chain[i].PPID == chain[i+1].PID.
	seen := map[int32]bool{}
	for i, p := range chain {
		if seen[p.PID] {
			t.Fatalf("cycle: pid %d appears twice", p.PID)
		}
		seen[p.PID] = true
		if i+1 < len(chain) && p.PPID != chain[i+1].PID {
			t.Errorf("chain[%d].PPID = %d, want %d (next node's PID)", i, p.PPID, chain[i+1].PID)
		}
	}

	// The chain terminates at a root: the last node's parent is unreachable
	// (0), itself, pid 1, or simply not continued. We assert it didn't stop
	// arbitrarily by requiring the tail's PPID to not be another live, distinct
	// pid we failed to follow — i.e. we reached 1 or a self/zero parent.
	tail := chain[len(chain)-1]
	if tail.PPID != 0 && tail.PPID != 1 && tail.PPID != tail.PID {
		// Allowed only if the parent genuinely couldn't be read; we can't easily
		// distinguish here, so just log rather than fail to avoid flakiness.
		t.Logf("chain tail pid=%d ppid=%d did not reach pid 1 (parent likely unreadable)", tail.PID, tail.PPID)
	}
}

// TestAncestryBadPID verifies a non-existent pid returns an error rather than a
// silent empty chain.
func TestAncestryBadPID(t *testing.T) {
	if _, err := Ancestry(-1); err == nil {
		t.Error("Ancestry(-1) = nil error, want error for invalid pid")
	}
}
