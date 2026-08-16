#!/usr/bin/env bash

set -euo pipefail

workflow_test_directory=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

for workflow_test in "$workflow_test_directory"/*.sh; do
  case "$(basename "$workflow_test")" in
    run.sh)
      continue
      ;;
  esac

  bash "$workflow_test"
done
