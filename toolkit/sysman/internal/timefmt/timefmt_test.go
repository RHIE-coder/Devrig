package timefmt

import (
	"testing"
	"time"
)

func TestFull(t *testing.T) {
	cases := []struct {
		d    time.Duration
		want string
	}{
		{5*24*time.Hour + 10*time.Hour + 23*time.Minute + 12*time.Second, "5d 10h 23m 12s"},
		{11*time.Hour + 51*time.Minute + 3*time.Second, "0d 11h 51m 3s"},
		{8 * time.Minute, "0d 0h 8m 0s"},
		{12 * time.Second, "0d 0h 0m 12s"},
		{0, "0d 0h 0m 0s"},
		{-5 * time.Second, "0d 0h 0m 0s"}, // clamps negatives
	}
	for _, c := range cases {
		if got := Full(c.d); got != c.want {
			t.Errorf("Full(%v) = %q, want %q", c.d, got, c.want)
		}
	}
}

func TestAgeAndStartedZero(t *testing.T) {
	if got := Age(time.Time{}); got != "?" {
		t.Errorf("Age(zero) = %q, want ?", got)
	}
	if got := Started(time.Time{}); got != "?" {
		t.Errorf("Started(zero) = %q, want ?", got)
	}
}
