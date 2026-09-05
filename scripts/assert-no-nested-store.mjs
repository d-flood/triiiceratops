#!/usr/bin/env node
// Refuses a `vendor/uncial/node_modules`, which silently breaks the site's build.
//
// Uncial is a workspace member here (`vendor/uncial/packages/*`) AND a complete
// pnpm workspace in its own right: it carries its own `pnpm-workspace.yaml` and
// its own lockfile. So a pnpm command whose cwd is inside `vendor/uncial`
// resolves against Uncial's root rather than this one, installs from Uncial's
// lockfile, and honours none of the `overrides` in our `pnpm-workspace.yaml`.
//
// The one that matters is `uncial-cms>vite: ^6.0.0`. Uncial's lockfile pins Vite
// 7; ours resolves uncial-cms against Vite 6 so that `createLocalVitePlugin`
// returns a `Plugin` of the same identity the site's `vite.config.ts` is typed
// against. A nested store shadows that, and the failure surfaces two steps away
// as svelte-check type errors in `apps/site` about mismatched `Plugin` types —
// which reads as a code problem and is not one.
//
// The root install provisions each member under
// `vendor/uncial/packages/*/node_modules`, which is ordinary. A nested install
// repoints those links into the nested store, so removing only the store leaves
// them dangling — and a plain `pnpm install` will not repair them, because the
// lockfile is already satisfied and pnpm reports "Already up to date". Recovery
// has to delete the member directories too, or the next `pnpm dev` serves a 500
// on every route from an unresolvable import inside Uncial's source.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const NESTED_STORE = join(REPO_ROOT, 'vendor', 'uncial', 'node_modules');

if (existsSync(NESTED_STORE)) {
    console.error(
        `assert-no-nested-store: ${NESTED_STORE} exists.

A pnpm command ran with its cwd inside vendor/uncial, which treated the
submodule as its own workspace root and installed without this repository's
Vite override. Left in place it fails \`pnpm --filter @triiiceratops/app-site
check\` with Plugin type errors that have nothing to do with the code.

Remove it, and the member directories it repointed, then reinstall from the
repository root. Deleting the store alone leaves those links dangling and
\`pnpm install\` reports "Already up to date" without relinking them:

    rm -rf vendor/uncial/node_modules vendor/uncial/packages/*/node_modules
    pnpm install

To run Uncial's own suites, use the root scripts, which resolve through this
workspace's store: \`pnpm check:uncial\`, \`pnpm test:uncial\`.`,
    );
    process.exitCode = 1;
}
