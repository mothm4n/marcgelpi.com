#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
requested_destination=${1:-public}

if [[ "$requested_destination" = /* ]]; then
  destination_candidate=$requested_destination
else
  destination_candidate="$repo_root/$requested_destination"
fi

mkdir -p "$destination_candidate"
destination=$(cd "$destination_candidate" && pwd -P)
system_tmp=$(cd "${TMPDIR:-/tmp}" && pwd -P)

if [[ "$destination" == "$repo_root/public" ]]; then
  :
elif [[ "$destination" == "$system_tmp"/* ]]; then
  :
else
  echo "Refusing unsafe production destination: $destination" >&2
  exit 2
fi

destination_parent=$(dirname "$destination")
staging_root=$(mktemp -d "$destination_parent/.site-build.XXXXXX")
staging_site="$staging_root/site"
backup_path=""
promotion_complete=false

cleanup() {
  if [[ -n "$backup_path" && -d "$backup_path" ]]; then
    if [[ "$promotion_complete" == true ]]; then
      rm -rf "$backup_path"
    else
      if [[ -e "$destination" ]]; then
        rm -rf "$destination"
      fi
      mv "$backup_path" "$destination"
    fi
  fi
  rm -rf "$staging_root"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

hugo_args=(
  --source "$repo_root"
  --destination "$staging_site"
  --environment production
  --gc
  --minify
)

if [[ -n "${SITE_CONTENT_DIR:-}" ]]; then
  hugo_args+=(--contentDir "$SITE_CONTENT_DIR")
fi

if [[ -n "${HUGO_CACHE_DIR:-}" ]]; then
  hugo_args+=(--cacheDir "$HUGO_CACHE_DIR")
fi

bash "$repo_root/scripts/run-hugo.sh" "${hugo_args[@]}"

backup_path=$(mktemp -d "$destination_parent/.site-backup.XXXXXX")
rmdir "$backup_path"
mv "$destination" "$backup_path"

if ! mv "$staging_site" "$destination"; then
  mv "$backup_path" "$destination"
  backup_path=""
  exit 1
fi

promotion_complete=true
rm -rf "$backup_path"
backup_path=""
