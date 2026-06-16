#!/usr/bin/env sh
# Install the DevRig toolkit gateway as the global `devrig` command. The toolkit
# root is baked into the binary, so `devrig run <name>` works from any directory.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

BIN="$(go env GOBIN)"
[ -z "$BIN" ] && BIN="$(go env GOPATH)/bin"
mkdir -p "$BIN"

echo "Installing 'devrig' (root: $ROOT)…"
go -C "$ROOT" build -ldflags "-X main.defaultRoot=$ROOT" -o "$BIN/devrig" .
echo "Installed: $BIN/devrig"

case ":$PATH:" in
	*":$BIN:"*) echo "PATH OK — try: devrig list" ;;
	*) echo "⚠ '$BIN' is not on your PATH. Add this to your shell profile:"
	   echo "    export PATH=\"$BIN:\$PATH\"" ;;
esac
