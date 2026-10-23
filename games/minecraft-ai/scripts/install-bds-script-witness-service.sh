#!/usr/bin/env bash
# Only manages a separate Mint per-user loopback HTTP receiver, NEVER BDS.
set -euo pipefail
action="${1:---check}"
[[ "$action" == --check || "$action" == --install ]] || {
  echo 'Usage: install-bds-script-witness-service.sh --check|--install' >&2; exit 2;
}
python3 "$HOME/minecraft-ai/scripts/bds_script_witness.py" --check
# Refuse competing trusted witness writers; never disable another service here.
if systemctl --user is-active --quiet alice-bds-position-witness.service; then
  echo 'Old console-query witness still running. Stop it through the operator workflow first.' >&2
  exit 1
fi
[[ "$action" == --install ]] || { echo 'Receiver config checked; no changes made.'; exit 0; }
unit_dir="$HOME/.config/systemd/user"
unit_file="$unit_dir/alice-bds-script-witness.service"
mkdir -p "$unit_dir"
if [[ -e "$unit_file" || -L "$unit_file" ]]; then
  if [[ ! -f "$unit_file" || -L "$unit_file" ]] ||
     ! grep -Fq 'Description=Alice silent script-position witness' "$unit_file"; then
    echo 'Existing unit is different; do not overwrite it.' >&2; exit 1
  fi
fi
cat > "$unit_file" <<EOF
[Unit]
Description=Alice silent script-position witness

[Service]
Type=simple
ExecStart=/usr/bin/python3 %h/minecraft-ai/scripts/bds_script_witness.py --serve
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.alice-bedrock-control

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now alice-bds-script-witness.service
systemctl --user is-active alice-bds-script-witness.service
