/*
 * The Paraglide message compiler, configured once for every vite config in this
 * package (build-time tooling — lives in src/packaging, never published).
 *
 * It emits INTO THE SOURCE TREE, at `src/lib/paraglide`, which is where
 * `src/lib/state/i18n.svelte.ts` imports `m` from and therefore where ~145 test
 * files reach transitively. That is the whole reason this module exists: a
 * rebuild of those modules is a mutation of files another process may be
 * importing at that instant.
 *
 * ## Why `cleanOutdir: false`
 *
 * The compiler's default is to `fs.rm(outdir, { recursive: true })` and rewrite
 * all ~160 modules. It skips that only when it can prove the output is
 * unchanged, and it proves that from `previousCompilation.outputHashes` — state
 * held IN MEMORY for the life of one compiler instance. A freshly spawned
 * `vite build` has no previous compilation, so every file reads as changed and
 * the wipe always happens.
 *
 * Measured against the default, one build leaves `src/lib/paraglide/messages`
 * EMPTY for ~27ms — 155 files to 0 and back. `cleanOutdir: false` replaces the
 * wipe with `mkdir`, so a rebuild overwrites each module in place instead of
 * unpublishing the directory first, and the directory is never seen absent.
 *
 * The trade is that a message DELETED from `messages/*.json` leaves its
 * generated module behind as an orphan. Nothing imports it — `messages/_index.js`
 * is regenerated and stops re-exporting it — and `pnpm build:lib` compiles to a
 * fresh directory, so the published output never carries one. A local
 * `src/lib/paraglide` that has accumulated orphans is gitignored and safe to
 * delete.
 *
 * ## Why {@link SKIP_ENV} exists
 *
 * `cleanOutdir: false` is not sufficient on its own. Overwriting in place still
 * truncates each file before writing it, and across a 160-file batch that is a
 * ~16ms window in which `runtime.js` and `messages.js` are readable but empty.
 *
 * The builds that race the suite are spawned BY it: `distributions.test.ts`
 * shells out four while vitest runs ~145 other files in parallel workers. None
 * of them needs to compile messages — vitest's own config (this same helper)
 * compiled them before the first test file was loaded. So those builds set
 * {@link SKIP_ENV} and perform no writes at all, which removes the hazard for
 * the one case that can turn CI red rather than narrowing it.
 *
 * Skipping fails loudly if the output is not already there, because a build
 * that silently produced a bundle with no messages in it is the failure this
 * whole module is trying to avoid.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import type { PluginOption } from 'vite';

/**
 * Set by a build that is spawned while something else is importing the compiled
 * messages, to leave them alone. Only safe when the output is already current —
 * which is asserted, not assumed.
 */
export const SKIP_ENV = 'TRIIICERATOPS_SKIP_MESSAGE_COMPILE';

const OUTDIR = './src/lib/paraglide';

/** Entry points every consumer of the compiled output reaches through. */
const REQUIRED = ['messages.js', 'runtime.js'];

/** The compiler as every config in this package registers it. */
export function messageCompiler(): PluginOption {
    if (!process.env[SKIP_ENV]) {
        return paraglideVitePlugin({
            project: './project.inlang',
            outdir: OUTDIR,
            cleanOutdir: false,
        });
    }

    const packageRoot = resolve(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
    );
    const absolute = resolve(packageRoot, OUTDIR);
    const absent = REQUIRED.filter((f) => !existsSync(join(absolute, f)));
    if (absent.length > 0) {
        throw new Error(
            `${SKIP_ENV} is set, but ${OUTDIR} is missing ${absent.join(', ')}. ` +
                `That variable means "the compiled messages are already current, ` +
                `do not rewrite them while something else is importing them" — it ` +
                `is not a way to build without messages. Compile them first ` +
                `(any ordinary build or \`pnpm exec paraglide-js compile ` +
                `--project ./project.inlang --outdir ${OUTDIR}\`), or unset it.`,
        );
    }
    return [];
}
