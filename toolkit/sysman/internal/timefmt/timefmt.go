// Package timefmt formats durations and process ages for table cells.
package timefmt

import (
	"fmt"
	"time"
)

// Full renders a duration with all four units, space-separated and consistent,
// so an AGE column lines up instead of switching shapes: "5d 10h 23m 12s",
// "0d 11h 51m 3s", "0d 0h 8m 0s", "0d 0h 0m 12s".
func Full(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	days := d / (24 * time.Hour)
	d %= 24 * time.Hour
	h := d / time.Hour
	d %= time.Hour
	m := d / time.Minute
	d %= time.Minute
	s := d / time.Second
	return fmt.Sprintf("%dd %dh %dm %ds", int(days), int(h), int(m), int(s))
}

// Age renders how long ago start was, or "?" if start is unknown (zero).
func Age(start time.Time) string {
	if start.IsZero() {
		return "?"
	}
	return Full(time.Since(start))
}

// Started renders an absolute start time ("2006-01-02 15:04"), or "?" if zero.
func Started(start time.Time) string {
	if start.IsZero() {
		return "?"
	}
	return start.Format("2006-01-02 15:04")
}
