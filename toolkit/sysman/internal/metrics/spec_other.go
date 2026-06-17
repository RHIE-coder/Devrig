//go:build !darwin

package metrics

// augmentSpec is a no-op off macOS: the P/E core split, GPU core count and
// machine model identifier are read through Apple-specific interfaces (sysctl
// hw.perflevel*, IORegistry). The cross-platform fields gathered in GatherSpec
// (CPU model, core counts, RAM, disk, OS) still populate everywhere.
func augmentSpec(_ *Spec) {}
