package macos

import (
	"strings"
	"testing"
)

// TestLeftoverMatches pins down the matching rules — the safety-critical part,
// since a false positive means deleting an unrelated app's data.
func TestLeftoverMatches(t *testing.T) {
	const bid = "com.foo.app"
	const name = "Foo"

	cases := []struct {
		entry      string
		wantMatch  bool
		wantByName bool
		why        string
	}{
		{"com.foo.app", true, false, "exact bundle ID"},
		{"com.foo.app.plist", true, false, "bundle ID with .plist stripped"},
		{"com.foo.app.savedState", true, false, "saved state suffix stripped"},
		{"com.foo.app.helper", true, false, "dotted-prefix helper / XPC service"},
		{"ABCDE12345.com.foo.app", true, false, "team-prefixed group container"},
		{"group.com.foo.app", true, false, "group.* container"},
		{"Foo", true, true, "display-name folder (flagged byName)"},
		{"foo", true, true, "display-name is case-insensitive"},
		{"com.foo.apple", false, false, "prefix without a dot boundary must NOT match"},
		{"com.foo.app2", false, false, "adjacent bundle ID must NOT match"},
		{"com.bar.other", false, false, "unrelated bundle ID"},
		{"Foobar", false, false, "name as substring must NOT match"},
	}
	for _, c := range cases {
		gotMatch, gotByName := leftoverMatches(c.entry, bid, name)
		if gotMatch != c.wantMatch || gotByName != c.wantByName {
			t.Errorf("leftoverMatches(%q): got (match=%v,byName=%v), want (%v,%v) — %s",
				c.entry, gotMatch, gotByName, c.wantMatch, c.wantByName, c.why)
		}
	}
}

// TestLeftoverMatchesNoBundleID verifies that with no bundle ID we fall back to
// name-only matching, always flagged byName.
func TestLeftoverMatchesNoBundleID(t *testing.T) {
	if m, byName := leftoverMatches("Foo", "", "Foo"); !m || !byName {
		t.Errorf(`no-bundleID name match: got (%v,%v), want (true,true)`, m, byName)
	}
	if m, _ := leftoverMatches("com.foo.app", "", "Foo"); m {
		t.Error("with no bundle ID and no name overlap, a bundle-shaped entry must not match")
	}
}

func TestHumanSize(t *testing.T) {
	cases := map[int64]string{0: "—", 512: "512 KB", 2048: "2.0 MB", 5 * 1024 * 1024: "5.00 GB"}
	for kb, want := range cases {
		if got := humanSize(kb); got != want {
			t.Errorf("humanSize(%d) = %q, want %q", kb, got, want)
		}
	}
}

// TestUninstallFlow drives the sub-tab through its states with synthetic
// messages (no real scan/removal runs) and checks the view never panics.
func TestUninstallFlow(t *testing.T) {
	m := newUninstall()
	m.SetSize(100, 24)

	// Loaded app list.
	m, _ = m.Update(appsLoadedMsg{apps: []appEntry{
		{Name: "Bar", Path: "/Applications/Bar.app"},
		{Name: "Foo", Path: "/Applications/Foo.app"},
	}})
	if !m.loaded || len(m.shown) != 2 {
		t.Fatalf("after load: loaded=%v shown=%d", m.loaded, len(m.shown))
	}

	// Filter narrows the list.
	m, _ = m.Update(key("/"))
	if !m.Filtering() {
		t.Fatal("'/' should enter filter mode")
	}
	m, _ = m.Update(key("f"))
	m, _ = m.Update(key("o"))
	if len(m.shown) != 1 || m.shown[0].Name != "Foo" {
		t.Fatalf("filter 'fo' should leave only Foo, got %d rows", len(m.shown))
	}

	// A completed scan moves to the review state.
	plan := removalPlan{
		App:      appEntry{Name: "Foo", Path: "/Applications/Foo.app"},
		BundleID: "com.foo.app",
		Items: []leftover{
			{Path: "/Applications/Foo.app", SizeKB: 1024, IsApp: true},
			{Path: "/Users/x/Library/Caches/com.foo.app", SizeKB: 2048},
		},
		TotalKB: 3072,
	}
	m, _ = m.Update(scanDoneMsg{plan: plan})
	if m.state != uReview {
		t.Fatalf("scan completion should move to uReview, got %v", m.state)
	}
	if out := m.View(); !strings.Contains(out, "Foo") || !strings.Contains(out, "com.foo.app") {
		t.Errorf("review view missing app/bundle id:\n%s", out)
	}

	// 'n' cancels back to the list.
	m, _ = m.Update(key("n"))
	if m.state != uList {
		t.Errorf("'n' in review should return to uList, got %v", m.state)
	}
}
