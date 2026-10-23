#!/usr/bin/env bash
# Installs official Node 24 in user-private Bedrock location; never changes system Node.
set -Eeuo pipefail
usage() { echo 'Usage: bash setup-node24-bedrock.sh --dry-run|--install' >&2; }
[[ $# -eq 1 ]] || { usage; exit 2; }
case "$1" in --dry-run|--install) MODE="$1" ;; *) usage; exit 2 ;; esac
[[ "$(uname -s)" == Linux ]] || { echo 'ERROR: Linux Mint only' >&2; exit 1; }
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64) NODE_ARCH=arm64 ;;
  *) echo 'ERROR: unsupported Node 24 CPU architecture' >&2; exit 1 ;;
esac
ROOT="$HOME/.local/share/alice-bedrock/node24"
BIN="$ROOT/current/bin"
if [[ "$MODE" == --dry-run ]]; then
  echo "[dry-run] Official Node.js 24 for linux-$NODE_ARCH"
  echo "[dry-run] Official release channel: https://nodejs.org/dist/latest-v24.x/"
  echo "[dry-run] User-private install root: $ROOT"
  echo '[dry-run] Does not change system node, npm, apt, bash settings or Paper Alice'
  exit 0
fi
if [[ -x "$BIN/node" ]]; then
  ver="$("$BIN/node" --version)"
  if [[ "$ver" =~ ^v24\. ]]; then
    echo "Node 24 already installed: $ver"
    echo "For this terminal only: export PATH=\"$BIN:\$PATH\""
    exit 0
  fi
  echo "ERROR: existing Bedrock Node path has unexpected version: $ver" >&2
  exit 1
fi
for cmd in curl sha256sum tar mktemp mv ln; do
  command -v "$cmd" >/dev/null || { echo "ERROR: missing $cmd" >&2; exit 1; }
done
umask 077
mkdir -p "$ROOT"
[[ ! -L "$ROOT" ]] || { echo 'ERROR: install root is a symlink' >&2; exit 1; }
MANIFEST_URL='https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt'
echo "Fetching official Node.js 24 release list: $MANIFEST_URL"
manifest="$(curl -fsSL --retry 2 --connect-timeout 10 --max-time 60 "$MANIFEST_URL")"
line="$(printf '%s\n' "$manifest" | awk -v a="$NODE_ARCH" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" a "\\.tar\\.xz$") { print $1, $2; exit }')"
[[ -n "$line" ]] || { echo 'ERROR: official Node 24 archive not found in release checksums' >&2; exit 1; }
read -r expected archive <<< "$line"
[[ "$expected" =~ ^[0-9a-f]{64}$ && "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || {
  echo 'ERROR: invalid official archive metadata' >&2; exit 1;
}
release="${archive%.tar.xz}"
tmp="$(mktemp -d "$ROOT/.download.XXXXXXXX")"
cleanup() { [[ -z "${tmp:-}" || ! -d "$tmp" ]] || rm -rf -- "$tmp"; }
trap cleanup EXIT
curl -fL --retry 2 --connect-timeout 10 --max-time 300 \
  "https://nodejs.org/dist/latest-v24.x/$archive" -o "$tmp/$archive"
(cd "$tmp" && printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status)
echo 'Node.js archive SHA256 verified'
tar -xJf "$tmp/$archive" -C "$tmp"
[[ -x "$tmp/$release/bin/node" ]] || { echo 'ERROR: node binary missing in verified archive' >&2; exit 1; }
[[ "$("$tmp/$release/bin/node" -p 'process.versions.node.split(".")[0]')" == 24 ]] || {
  echo 'ERROR: unexpected node major in extracted archive' >&2; exit 1;
}
if [[ -e "$ROOT/$release" ]]; then
  echo 'ERROR: target release folder already exists; inspect it before retrying' >&2
  exit 1
fi
if [[ -e "$ROOT/current" && ! -L "$ROOT/current" ]]; then
  echo 'ERROR: current entry is not a symlink; refusing overwrite' >&2
  exit 1
fi
mv -- "$tmp/$release" "$ROOT/$release"
ln -s "$release" "$tmp/current"
mv -Tf -- "$tmp/current" "$ROOT/current"
echo "Installed isolated Bedrock Node: $("$BIN/node" --version)"
echo "For this terminal only: export PATH=\"$BIN:\$PATH\""
echo 'System/Paper node was not replaced.'