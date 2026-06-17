//go:build darwin

package metrics

import "testing"

func TestPercentBefore(t *testing.T) {
	cases := map[string]int{
		"-InternalBattery-0 (id=1)\t87%; discharging; 3:41 remaining": 87,
		"100%; charged; 0:00 remaining":                               100,
		"5%; discharging":                                             5,
		"no percent here":                                             -1,
	}
	for in, want := range cases {
		if got := percentBefore(in); got != want {
			t.Errorf("percentBefore(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestClassifyBatteryState(t *testing.T) {
	cases := map[string]string{
		"Now drawing from 'Battery Power'\n -InternalBattery-0 87%; discharging; 3:41": "discharging",
		"Now drawing from 'AC Power'\n -InternalBattery-0 100%; charged; 0:00":         "charged",
		"-InternalBattery-0 80%; charging; 0:42":                                       "charging",
		"-InternalBattery-0 95%; finishing charge; 0:05":                               "charging",
	}
	for in, want := range cases {
		if got := classifyBatteryState(in); got != want {
			t.Errorf("classifyBatteryState(%q) = %q, want %q", in, got, want)
		}
	}
}
