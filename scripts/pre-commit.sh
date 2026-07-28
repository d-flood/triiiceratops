#!/usr/bin/env bash
# Pre-commit gate (installed by simple-git-hooks, see package.json).
#
# Runs the same formatters and lint rules as CI, limited to staged files so the
# cost of committing does not grow with the workspace.
set -euo pipefail

mapfile -d '' staged < <(git diff --name-only --cached --diff-filter=ACMR -z)
if [ "${#staged[@]}" -eq 0 ]; then
    exit 0
fi

pnpm exec prettier --write --ignore-unknown -- "${staged[@]}"
# Re-stage exactly the files that were already staged, picking up any fix
# `format` made to them. Leaves untouched any unrelated working-tree edits
# the developer hasn't staged yet.
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
    # `--no-warn-ignored`: staged paths are passed explicitly, and eslint warns
    # when an explicit path matches an `ignores` pattern. Under
    # `--max-warnings 0` that fails the commit for files eslint was configured
    # not to lint (generated code, `site/`, ...), so suppress that one warning.
    pnpm exec eslint --max-warnings 0 --no-warn-ignored -- "${lintable[@]}"
fi
