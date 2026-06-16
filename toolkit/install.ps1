# Install the DevRig toolkit gateway as the global `devrig` command on Windows.
# The toolkit root is baked into the binary, so `devrig run <name>` works from
# any directory.
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

$Bin = (go env GOBIN)
if (-not $Bin) { $Bin = Join-Path (go env GOPATH) "bin" }
New-Item -ItemType Directory -Force -Path $Bin | Out-Null

Write-Host "Installing 'devrig' (root: $Root)..."
go -C $Root build -ldflags "-X main.defaultRoot=$Root" -o (Join-Path $Bin "devrig.exe") .
Write-Host "Installed: $Bin\devrig.exe"

if (($env:PATH -split ";") -notcontains $Bin) {
	Write-Host "WARNING: '$Bin' is not on your PATH. Add it, e.g.:"
	Write-Host "    setx PATH `"$Bin;`$env:PATH`""
}
