#!/usr/bin/env bash

set -euo pipefail

acceptance_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

for acceptance_test in "$acceptance_directory"/*.sh; do
  case "$(basename "$acceptance_test")" in
    helpers.sh | run.sh)
      continue
      ;;
  esac

  bash "$acceptance_test"
done
