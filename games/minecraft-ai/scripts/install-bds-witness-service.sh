#!/bin/sh
# Mint user service for the existing read-only witness. No BDS/Alice restart.
# --check validates prerequisites without installing; default installs/enables.
set -eu
case "${1:-}" in ''|--check) ;; *) echo 'usage: install-bds-witness-service.sh [--check]' >&2; exit 2;; esac
test "$(uname -s)" = Linux
command -v systemctl >/dev/null
test -x /usr/bin/python3
test -f "$HOME/minecraft-ai/scripts/bds_position_witness.py"
/usr/bin/python3 "$HOME/minecraft-ai/scripts/bds_position_witness.py" --check
systemctl --user show-environment >/dev/null
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/alice-bds-position-witness.service"
umask 077
candidate=$(mktemp)
trap 'rm -f "$candidate"' EXIT HUP INT TERM
cat > "$candidate" <<'UNIT'
[Unit]
Description=Alice read-only BDS position witness
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 %h/minecraft-ai/scripts/bds_position_witness.py --loop
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
UNIT
if test -L "$unit_file" || { test -e "$unit_file" && ! cmp -s "$candidate" "$unit_file"; }; then
  echo 'Existing witness unit differs; preserve it and inspect before replacing.' >&2
  exit 1
fi
if test "${1:-}" = --check; then
  echo 'Witness configuration and user-service prerequisites verified; no service changed.'
  exit 0
fi
mkdir -p "$unit_dir"
test -e "$unit_file" || cp "$candidate" "$unit_file"
systemctl --user daemon-reload
systemctl --user enable --now alice-bds-position-witness.service
systemctl --user is-active alice-bds-position-witness.service
