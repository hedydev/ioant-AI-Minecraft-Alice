#!/bin/sh
# Mint user service for the existing read-only witness. No BDS/Alice restart.
# Disabled the old continuous querytarget auto-installer. Only read-only --check remains.
set -eu
case "${1:-}" in --check) ;; *) echo 'Continuous witness service retired: read-only --check only; no service installed or enabled.' >&2; exit 2;; esac
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
echo 'Legacy witness config and service prerequisites verified; no service changed.'
echo 'Continuous querytarget service remains disabled. Explicit --once is separate.'
exit 0
