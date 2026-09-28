#!/usr/bin/env bash
# Pre-commit gate: same formatters and lint as CI, staged files only.
set -euo pipefail

mapfile -d '' staged < <(git diff --name-only --cached --diff-filter=ACMR -z)
if [ "${#staged[@]}" -eq 0 ]; then
    exit 0
fi

pnpm exec prettier --write --ignore-unknown -- "${staged[@]}"
git add -- "${staged[@]}"

lintable=()
for file in "${staged[@]}"; do
    case "$file" in
        *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.mts | *.cts | *.svelte)
            lintable+=("$file")
            ;;
    esac
done

if [ "${#lintable[@]}" -gt 0 ]; then
    pnpm exec eslint --max-warnings 0 --no-warn-ignored -- "${lintable[@]}"
fi
