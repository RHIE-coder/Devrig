package macos

import "testing"

// TestParseSpotlightBroken locks the real-world symptom this tab exists for:
// `mdutil -s /` shows the boot volume as enabled while the Data volume — where
// /Applications lives — is in an error state. Reading all volumes must flag that
// as unhealthy, and the duplicate Data entry (firmlinks) must be collapsed.
func TestParseSpotlightBroken(t *testing.T) {
	out := "/:\n\tIndexing enabled. \n" +
		"/System/Volumes/Data:\n\tError: unknown indexing state.\n" +
		"/System/Volumes/Data:\n\tError: unknown indexing state.\n" +
		"/System/Volumes/Preboot:\n\tIndexing enabled."

	healthy, lines := parseSpotlight(out)
	if healthy {
		t.Error("healthy = true, want false (Data volume is in an error state)")
	}
	if len(lines) != 3 {
		t.Fatalf("got %d lines %q, want 3 (duplicate Data entry collapsed)", len(lines), lines)
	}
	if lines[1] != "/System/Volumes/Data — Error: unknown indexing state." {
		t.Errorf("Data line = %q", lines[1])
	}
}

func TestParseSpotlightHealthy(t *testing.T) {
	out := "/:\n\tIndexing enabled.\n/System/Volumes/Data:\n\tIndexing enabled."
	healthy, lines := parseSpotlight(out)
	if !healthy {
		t.Errorf("healthy = false, want true; lines=%q", lines)
	}
	if len(lines) != 2 {
		t.Errorf("got %d lines, want 2", len(lines))
	}
}

func TestParseDisableSleep(t *testing.T) {
	cases := []struct {
		name      string
		out       string
		wantVal   int
		wantFound bool
	}{
		{"on", " standby 1\n disablesleep         1\n hibernatemode 3", 1, true},
		{"off", "Currently in use:\n disablesleep 0\n", 0, true},
		{"absent", "Currently in use:\n standby 1\n womp 1", 0, false},
	}
	for _, c := range cases {
		val, found := parseDisableSleep(c.out)
		if val != c.wantVal || found != c.wantFound {
			t.Errorf("%s: parseDisableSleep = (%d,%v), want (%d,%v)", c.name, val, found, c.wantVal, c.wantFound)
		}
	}
}

func TestIsCancel(t *testing.T) {
	if !isCancel("execution error: User canceled. (-128)", nil) {
		t.Error("user-cancel output should be detected as a cancel")
	}
	if isCancel("mdutil: some real failure", nil) {
		t.Error("a real failure must not be misclassified as a cancel")
	}
}
