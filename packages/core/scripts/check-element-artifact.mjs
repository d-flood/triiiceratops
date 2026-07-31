/*
 * Guard: the framework substrate's lazy registration imports the self-contained
 * element bundle by RELATIVE specifier, and that artifact is produced by a
 * LATER build step than the module containing the import.
 *
 * `build:lib` (svelte-package) emits `dist/framework/registration.js`, whose
 * `import('../triiiceratops-element.js')` resolves to `dist/triiiceratops-element.js`
 * — written afterwards by `build:element`. Nothing in the compile of the former
 * can verify the latter exists, and `svelte-package` clears `dist/`, so a
 * `build:lib` run that is not followed by `build:element` leaves a published
 * tree whose React and Vue entry points fail at first mount with a module-not-
 * found error. That failure would surface only in a packed consumer.
 *
 * This asserts, after `build:element`, that every relative specifier the
 * substrate dynamic-imports resolves to a file that is actually on disk.
 *
 * Run directly: `node ./scripts/check-element-artifact.mjs`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Modules that dynamic-import a build artifact, and what they must resolve. */
const IMPORTERS = [path.resolve('dist', 'framework', 'registration.js')];

const DYNAMIC_IMPORT_RE = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

const problems = [];
let checked = 0;

for (const importer of IMPORTERS) {
    if (!existsSync(importer)) {
        problems.push(
            `${path.relative(process.cwd(), importer)} is missing — run \`pnpm build:lib\` first.`,
        );
        continue;
    }
    const source = readFileSync(importer, 'utf8');
    const specifiers = [...source.matchAll(DYNAMIC_IMPORT_RE)].map((m) => m[1]);
    if (specifiers.length === 0) {
        problems.push(
            `${path.relative(process.cwd(), importer)} contains no relative dynamic import; ` +
                `the element bundle is no longer loaded by relative specifier.`,
        );
        continue;
    }
    for (const specifier of specifiers) {
        const resolved = path.resolve(path.dirname(importer), specifier);
        checked++;
        if (!existsSync(resolved)) {
            problems.push(
                `${path.relative(process.cwd(), importer)} imports "${specifier}", but ` +
                    `${path.relative(process.cwd(), resolved)} does not exist. ` +
                    `Run \`pnpm build:element\` after \`pnpm build:lib\`.`,
            );
        }
    }
}

if (problems.length > 0) {
    console.error('check-element-artifact: missing build artifacts\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    `check-element-artifact: ${checked} dynamic element-bundle import(s) resolve.`,
);
