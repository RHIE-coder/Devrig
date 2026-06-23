// Command builder is a DevRig toolkit tool: the engine that turns recipes stored
// under forge/ into files on disk.
//
// A recipe is a directory holding a forge.yaml manifest plus its payload files.
// There is no fixed recipe "type" — what the engine does is decided by which
// manifest fields are filled in (a lone static file and a full project generator
// are the same type; the latter just fills in more fields). The user picks a
// verb by intent:
//
//	builder list                  list every recipe found under forge/
//	builder get  <name>           print a recipe's payload to stdout (passive grab)
//	builder add  <name> [target]  copy a recipe into an existing place
//	builder new  <name> <dir>     generate a new project tree (stage 3)
//
// Recipes live at forge/<domain>/<recipe>/forge.yaml; <domain> is just a folder
// for browsing (claude, react, ci…) and carries no behavior.
package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/term"
	"gopkg.in/yaml.v3"
)

const manifestName = "forge.yaml"

// Recipe is a forge.yaml manifest. Behavior is emergent from the fields present,
// not from a category.
type Recipe struct {
	Name   string   `yaml:"name"`
	About  string   `yaml:"about"`
	Dest   string   `yaml:"dest"`   // "inplace" (default) | "new"
	Target string   `yaml:"target"` // default destination for `add` (~ expanded)
	Files  []string `yaml:"files"`  // payload paths relative to recipe dir; empty = all but the manifest
	Patch  []Patch  `yaml:"patch"`  // config edits applied by `add` (stage 2)
	Vars   []Var    `yaml:"vars"`   // prompts for `new` rendering (stage 3)
	Post   []string `yaml:"post"`   // post-generation hooks for `new` (stage 3)

	Dir    string `yaml:"-"` // resolved recipe directory
	Domain string `yaml:"-"` // parent folder (claude/react/…), for display only
}

// Patch is a single config edit: set dotted keys in a file. Applied by `add`
// (stage 2 — currently surfaced as manual instructions).
type Patch struct {
	File string            `yaml:"file"`
	Set  map[string]string `yaml:"set"`
}

// Var is a prompt fed into `new` template rendering (stage 3).
type Var struct {
	Name   string `yaml:"name"`
	Prompt string `yaml:"prompt"`
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "builder: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	var cmd string
	if len(args) > 0 {
		cmd, args = args[0], args[1:]
	}
	switch cmd {
	case "":
		// No subcommand: interactive picker on a terminal (e.g. chosen from the
		// `devrig` menu), plain list when piped.
		if isInteractive() {
			return cmdInteractive()
		}
		return cmdList()
	case "list", "ls":
		return cmdList()
	case "pick", "menu":
		return cmdInteractive()
	case "get":
		if len(args) < 1 {
			return fmt.Errorf("usage: builder get <name>")
		}
		return cmdGet(args[0])
	case "add":
		if len(args) < 1 {
			return fmt.Errorf("usage: builder add <name> [target]")
		}
		target := ""
		if len(args) > 1 {
			target = args[1]
		}
		return cmdAdd(args[0], target)
	case "new":
		return fmt.Errorf("`new` (프로젝트 생성)은 stage 3에서 구현됩니다")
	case "help", "-h", "--help":
		printUsage()
		return nil
	default:
		printUsage()
		return fmt.Errorf("unknown command %q", cmd)
	}
}

// findForge locates the forge/ library. Priority: $DEVRIG_FORGE, then a sibling
// of $DEVRIG_ROOT (the gateway's baked toolkit root), then a walk up from the
// working directory. Tools run with cwd set to their own directory
// (toolkit/builder/), so the walk reaches the repo root that holds forge/.
func findForge() (string, error) {
	if env := os.Getenv("DEVRIG_FORGE"); env != "" {
		return env, nil
	}
	if root := os.Getenv("DEVRIG_ROOT"); root != "" {
		if f := filepath.Join(filepath.Dir(root), "forge"); isDir(f) {
			return f, nil
		}
	}
	start, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := start; ; {
		if f := filepath.Join(dir, "forge"); isDir(f) {
			return f, nil
		}
		if filepath.Base(dir) == "forge" {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("forge/ not found above %q; set DEVRIG_FORGE", start)
}

// discover loads every recipe under forge/<domain>/<recipe>/forge.yaml, sorted
// by domain then name. Domains starting with "." (e.g. .deprecated) are skipped.
func discover() ([]*Recipe, error) {
	forge, err := findForge()
	if err != nil {
		return nil, err
	}
	matches, err := filepath.Glob(filepath.Join(forge, "*", "*", manifestName))
	if err != nil {
		return nil, err
	}
	var recipes []*Recipe
	for _, path := range matches {
		domain := filepath.Base(filepath.Dir(filepath.Dir(path)))
		if strings.HasPrefix(domain, ".") {
			continue
		}
		r, err := loadRecipe(path)
		if err != nil {
			return nil, err
		}
		r.Domain = domain
		recipes = append(recipes, r)
	}
	sort.Slice(recipes, func(i, j int) bool {
		if recipes[i].Domain != recipes[j].Domain {
			return recipes[i].Domain < recipes[j].Domain
		}
		return recipes[i].Name < recipes[j].Name
	})
	return recipes, nil
}

func loadRecipe(path string) (*Recipe, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var r Recipe
	if err := yaml.Unmarshal(data, &r); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	r.Dir = filepath.Dir(path)
	if r.Name == "" {
		r.Name = filepath.Base(r.Dir)
	}
	return &r, nil
}

// find resolves a recipe by bare name ("claude-statusline") or a domain-
// qualified name ("claude/claude-statusline") when the bare name is ambiguous.
func find(name string) (*Recipe, error) {
	recipes, err := discover()
	if err != nil {
		return nil, err
	}
	var hits []*Recipe
	for _, r := range recipes {
		if r.Name == name || r.Domain+"/"+r.Name == name {
			hits = append(hits, r)
		}
	}
	switch len(hits) {
	case 1:
		return hits[0], nil
	case 0:
		return nil, fmt.Errorf("unknown recipe %q (try: builder list)", name)
	default:
		var qual []string
		for _, h := range hits {
			qual = append(qual, h.Domain+"/"+h.Name)
		}
		return nil, fmt.Errorf("ambiguous recipe %q; qualify it: %s", name, strings.Join(qual, ", "))
	}
}

// verbList reports which commands a recipe supports, derived from its destination.
func (r *Recipe) verbList() []string {
	if r.Dest == "new" {
		return []string{"new"}
	}
	return []string{"get", "add"}
}

func (r *Recipe) verbs() string { return strings.Join(r.verbList(), ", ") }

// payload returns the recipe's payload files as paths relative to its dir. An
// explicit files: list wins; otherwise every entry except the manifest and a
// README is included.
func (r *Recipe) payload() ([]string, error) {
	if len(r.Files) > 0 {
		return r.Files, nil
	}
	entries, err := os.ReadDir(r.Dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() || n == manifestName || strings.EqualFold(n, "README.md") {
			continue
		}
		files = append(files, n)
	}
	return files, nil
}

func cmdList() error {
	recipes, err := discover()
	if err != nil {
		return err
	}
	if len(recipes) == 0 {
		fmt.Println("forge/ 에서 레시피를 찾지 못했습니다.")
		return nil
	}
	fmt.Println("DevRig forge recipes:")
	fmt.Println()
	lastDomain := ""
	for _, r := range recipes {
		if r.Domain != lastDomain {
			fmt.Printf("  %s/\n", r.Domain)
			lastDomain = r.Domain
		}
		fmt.Printf("    %s  —  %s  [%s]\n", r.Name, r.About, r.verbs())
	}
	fmt.Println()
	fmt.Println("usage: builder <get|add|new> <name>")
	return nil
}

func cmdGet(name string) error {
	r, err := find(name)
	if err != nil {
		return err
	}
	if r.Dest == "new" {
		return fmt.Errorf("%q는 프로젝트 생성용입니다 — `builder new %s <dir>`를 쓰세요", r.Name, r.Name)
	}
	files, err := r.payload()
	if err != nil {
		return err
	}
	for i, f := range files {
		data, err := os.ReadFile(filepath.Join(r.Dir, f))
		if err != nil {
			return err
		}
		if len(files) > 1 {
			if i > 0 {
				fmt.Println()
			}
			fmt.Printf("==> %s <==\n", f)
		}
		os.Stdout.Write(data)
	}
	return nil
}

func cmdAdd(name, target string) error {
	r, err := find(name)
	if err != nil {
		return err
	}
	if r.Dest == "new" {
		return fmt.Errorf("%q는 프로젝트 생성용입니다 — `builder new %s <dir>`를 쓰세요", r.Name, r.Name)
	}
	if target == "" {
		target = r.Target
	}
	if target == "" {
		return fmt.Errorf("설치 위치가 없습니다 — 매니페스트에 target을 넣거나 인자로 주세요: builder add %s <target>", r.Name)
	}
	target = expandHome(target)

	files, err := r.payload()
	if err != nil {
		return err
	}
	for _, f := range files {
		src := filepath.Join(r.Dir, f)
		dst := filepath.Join(target, f)
		existed := fileExists(dst)
		if err := copyFile(src, dst); err != nil {
			return err
		}
		verb := "wrote     "
		if existed {
			verb = "overwrote "
		}
		fmt.Printf("%s %s\n", verb, dst)
	}
	if len(r.Patch) > 0 {
		fmt.Println()
		fmt.Println("⚠ 설정 배선(patch)은 아직 자동 적용되지 않습니다 (stage 2). 수동으로 적용하세요:")
		for _, p := range r.Patch {
			for k, v := range p.Set {
				fmt.Printf("    %s → %s = %q\n", expandHome(p.File), k, v)
			}
		}
	}
	if len(r.Post) > 0 {
		fmt.Println()
		fmt.Println("ℹ post-hook은 `new`(stage 3)에서 실행됩니다.")
	}
	return nil
}

// isInteractive reports whether stdin is a terminal — i.e. the tool was launched
// from the gateway picker rather than piped or handed an explicit subcommand.
// A real TTY check (not just a char-device test, which /dev/null also passes).
func isInteractive() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

// cmdInteractive is the flow shown when builder is picked from the `devrig` menu
// (no subcommand, on a terminal): a Bubble Tea picker chooses a recipe, then a
// verb (and a target for `add`); the selection then runs on the restored
// terminal — the same hand-off the gateway menu uses.
func cmdInteractive() error {
	recipes, err := discover()
	if err != nil {
		return err
	}
	if len(recipes) == 0 {
		fmt.Println("forge/ 에 레시피가 없습니다.")
		return nil
	}
	p, err := runPicker(recipes)
	if err != nil {
		return err
	}
	if p == nil {
		return nil // cancelled
	}
	switch p.verb {
	case "get":
		return cmdGet(p.recipe.Name)
	case "add":
		return cmdAdd(p.recipe.Name, p.target)
	default: // new
		return fmt.Errorf("`new` (프로젝트 생성)은 stage 3에서 구현됩니다")
	}
}

func verbDesc(v string) string {
	switch v {
	case "get":
		return "내용을 화면에 출력"
	case "add":
		return "기존 위치에 설치"
	case "new":
		return "새 프로젝트 생성"
	}
	return ""
}

func printUsage() {
	fmt.Print(`builder — DevRig forge 엔진

forge/ 에 저장된 레시피를 파일로 찍어냅니다. 레시피는 forge.yaml + payload 이고,
"종류"가 아니라 매니페스트 필드가 동작을 정합니다.

Usage:
  builder                       (터미널) 인터랙티브 선택 — devrig 메뉴에서 고르면 이 모드
  builder list                  모든 레시피 나열
  builder get  <name>           레시피 내용을 stdout으로 (그냥 꺼내기)
  builder add  <name> [target]  레시피를 기존 위치에 설치 (target 생략 시 매니페스트 기본값)
  builder new  <name> <dir>     새 프로젝트 트리 생성 (stage 3, 미구현)

이름은 'claude-statusline' 또는 모호하면 'claude/claude-statusline' 형식.
`)
}

func expandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, strings.TrimPrefix(p, "~"))
		}
	}
	return p
}

func isDir(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

func fileExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
