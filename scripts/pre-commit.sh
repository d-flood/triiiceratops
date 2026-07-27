#!/usr/bin/env bash
# Pre-commit gate (installed by simple-git-hooks, see package.json).
#
# Runs the SAME format + lint scripts CI's Quality Gates job runs, so
# formatting/lint violations are caught before push instead of at CI —
# exactly the class of failure that slipped through pre-1.0 (build:all was
# crashing before format:check/lint ever ran, so violations piled up
# unnoticed across several commits).
set -euo pipefail

staged=$(git diff --name-only --cached --diff-filter=ACMR)
if [ -z "$staged" ]; then
    exit 0
fi

pnpm format
# Re-stage exactly the files that were already staged, picking up any fix
# `format` made to them. Leaves untouched any unrelated working-tree edits
# the developer hasn't staged yet.
echo "$staged" | xargs -r git add --

pnpm lint
