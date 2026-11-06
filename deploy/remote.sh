#!/usr/bin/env bash
set -euo pipefail
umask 022

mode=$1
upload=$2
base=/opt/artisanist
data=/var/lib/artisanist
backups=/var/backups/artisanist
stopped=false
switched=false
was_active=false
backup=

[[ $EUID -eq 0 ]] || { echo 'Deploy using a root SSH account.' >&2; exit 1; }
for command in curl tar xz sha256sum flock systemctl; do command -v "$command" >/dev/null; done
exec 9>/run/lock/artisanist-deploy.lock
flock -n 9 || { echo 'Another Artisanist deployment is running.' >&2; exit 1; }

finish() {
  status=$?
  if [[ $status -ne 0 ]]; then
    if [[ $switched == true ]]; then
      systemctl stop artisanist.service || true
      echo "Deployment failed; Artisanist is stopped. Database backup: $backup" >&2
      echo 'Inspect journalctl -u artisanist.service before recovery; code rollback does not undo migrations.' >&2
    elif [[ $stopped == true && $was_active == true ]]; then
      systemctl start artisanist.service || true
    fi
  fi
}
trap finish EXIT

if [[ $mode == setup ]]; then
  if ! id artisanist >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$data" --shell /usr/sbin/nologin artisanist
  fi
  install -d -m 755 "$base" "$base/releases" "$base/runtimes"
  install -d -m 700 -o artisanist -g artisanist "$data"
  install -d -m 700 "$backups"
else
  id artisanist >/dev/null
  systemctl cat artisanist.service >/dev/null
  [[ -d $data && -d $backups ]]
fi

release=$(mktemp -d "$base/releases/$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")
chmod 755 "$release"
tar --no-same-owner --no-same-permissions -xzf "$upload/release.tar.gz" -C "$release"
version=$(sed -n 's/^node = "\([0-9.]*\)"$/\1/p' "$release/mise.toml")
[[ $version =~ ^24\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid pinned Node version.' >&2; exit 1; }
case $(uname -m) in
  x86_64) arch=x64 ;;
  aarch64) arch=arm64 ;;
  *) echo 'Unsupported server architecture.' >&2; exit 1 ;;
esac
runtime="$base/runtimes/node-v$version-linux-$arch"
if [[ ! -x $runtime/bin/node ]]; then
  filename="node-v$version-linux-$arch.tar.xz"
  curl -fsSL --retry 3 "https://nodejs.org/dist/v$version/$filename" -o "$upload/$filename"
  curl -fsSL --retry 3 "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o "$upload/SHASUMS256.txt"
  (cd "$upload"; awk -v name="$filename" '$2 == name' SHASUMS256.txt | sha256sum -c -)
  # Publish on the same filesystem, so an interrupted install cannot leave a partial runtime.
  installing=$(mktemp -d "$base/runtimes/.install.XXXXXXXX")
  tar --no-same-owner --no-same-permissions --strip-components=1 \
    -xJf "$upload/$filename" -C "$installing"
  chmod 755 "$installing"
  mv "$installing" "$runtime"
fi
ln -s "$runtime" "$release/runtime"
cd "$release"
# Dependencies are pure JavaScript; never execute package lifecycle scripts as root.
"$runtime/bin/node" "$runtime/lib/node_modules/npm/bin/npm-cli.js" ci \
  --omit=dev --ignore-scripts --no-audit --no-fund --cache "$upload/npm-cache"

if [[ $mode == setup ]]; then
  install -m 644 deploy/artisanist.service /etc/systemd/system/artisanist.service
  systemctl daemon-reload
  systemctl enable artisanist.service
fi
if systemctl is-active --quiet artisanist.service; then was_active=true; fi
systemctl stop artisanist.service
stopped=true
backup="$backups/$(basename "$release")"
install -d -m 700 "$backup" "$backup/database"
# Preserve the entire stopped database directory, including any WAL/SHM files.
cp -a "$data/." "$backup/database/"
if [[ -L $base/current ]]; then
  readlink "$base/current" > "$backup/release"
  ln -sfn "$(readlink "$base/current")" "$base/previous"
fi
ln -sfn "$release" "$base/.current-next"
switched=true
mv -Tf "$base/.current-next" "$base/current"
systemctl reset-failed artisanist.service
systemctl start artisanist.service
for attempt in {1..30}; do
  if systemctl is-active --quiet artisanist.service && \
    [[ $(curl -fs --max-time 2 http://127.0.0.1:3000/health) == '{"status":"ok"}' ]]; then
    echo "Deployed $release"
    echo "Pre-deployment database backup: $backup"
    exit 0
  fi
  sleep 1
done
echo 'Artisanist did not become healthy within 30 checks.' >&2
exit 1
