// Package manifest discovers and parses per-tool tool.yaml files. Each tool in
// the toolkit declares how it is run, built, and provisioned in its own
// manifest, and the gateway aggregates them — no central list to keep in sync.
package manifest

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"gopkg.in/yaml.v3"
)

// manifestName is the file each tool directory provides to register itself.
const manifestName = "tool.yaml"

// Manifest describes how to build, run, and provision a single toolkit tool.
type Manifest struct {
	Name        string   `yaml:"name"`
	Description string   `yaml:"description"`
	Lang        string   `yaml:"lang"`
	Run         string   `yaml:"run"`
	Build       string   `yaml:"build"`
	Requires    []string `yaml:"requires"`

	Dir string `yaml:"-"` // resolved directory of the tool (not from YAML)
}

// FindRoot locates the toolkit root: the directory that directly contains tool
// directories (has at least one */tool.yaml). Priority: $DEVRIG_ROOT, then a
// walk up from the working directory (also checking a child "toolkit/" so it
// works from the repo root), then the fallback (e.g. a path baked into an
// installed binary). This lets the same binary work both inside a checkout and
// from any project directory.
func FindRoot(fallback string) (string, error) {
	if env := os.Getenv("DEVRIG_ROOT"); env != "" {
		return env, nil
	}

	start, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for dir := start; ; {
		if hasManifests(dir) {
			return dir, nil
		}
		if child := filepath.Join(dir, "toolkit"); hasManifests(child) {
			return child, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	if fallback != "" {
		return fallback, nil
	}
	return "", fmt.Errorf("toolkit root not found above %q (no */%s); set DEVRIG_ROOT", start, manifestName)
}

func hasManifests(dir string) bool {
	matches, _ := filepath.Glob(filepath.Join(dir, "*", manifestName))
	return len(matches) > 0
}

// Load reads and parses a single manifest, recording its directory.
func Load(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	if m.Name == "" {
		return nil, fmt.Errorf("%s: missing 'name'", path)
	}
	m.Dir = filepath.Dir(path)
	return &m, nil
}

// Discover loads every tool manifest under root, sorted by name.
func Discover(root string) ([]*Manifest, error) {
	matches, err := filepath.Glob(filepath.Join(root, "*", manifestName))
	if err != nil {
		return nil, err
	}
	tools := make([]*Manifest, 0, len(matches))
	for _, path := range matches {
		m, err := Load(path)
		if err != nil {
			return nil, err
		}
		tools = append(tools, m)
	}
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })
	return tools, nil
}

// Find returns the manifest for a named tool, or an error listing the hint.
func Find(root, name string) (*Manifest, error) {
	tools, err := Discover(root)
	if err != nil {
		return nil, err
	}
	for _, m := range tools {
		if m.Name == name {
			return m, nil
		}
	}
	return nil, fmt.Errorf("unknown tool %q (try: toolkit list)", name)
}
