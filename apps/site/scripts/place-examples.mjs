#!/usr/bin/env node
// Carry the framework consumer examples into the site's build output.
//
// `apps/examples` is built its own way and stays that way. Its Svelte example
// has a Vite build; its web-component and plain-HTML examples are copied
// verbatim; and its `dist/` is the real `triiiceratops` package output copied out
// of the module tree. That last step is the whole point of the application: it
// consumes the viewer through published entrypoints with no aliasing, and the
// plain-HTML page is no-build by definition. Making them routes would destroy
// what they exist to prove, so they are placed rather than ported.
//
// The layout inside the examples' own output IS the layout they are published
// at: `examples/{svelte,web-component,plain-html}/` beside `dist/`, the release
// bundles that the web-component and plain-HTML pages load with
// `src="../../dist/…"`. Placing that output at the root of the site's build is
// what makes those references resolve, and for the no-build page that reference
// is the only thing pinning where the bundles live — so the copy is followed by
// a check that every reference in the placed pages lands on a real file inside
// the tree, through the same resolution the URL contract gate uses.
//
// The examples' own build is not run from here. `@triiiceratops/app-examples` is
// a declared dependency of this application, which is what orders the two builds
// under `pnpm build:all`; running it as a nested package-manager invocation would
// race that ordering.
//
// Usage:
//   node scripts/place-examples.mjs [--examples <dir>] [--build <dir>]

import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unresolvedTargets } from '../../../scripts/url-contract.mjs';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function parseArgs(argv) {
    const args = {
        examples: join(REPO_ROOT, 'apps', 'examples', 'dist'),
        build: join(APP_ROOT, 'build'),
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--examples') args.examples = argv[++i];
        else if (flag === '--build') args.build = argv[++i];
        else throw new Error(`unknown argument: ${flag}`);
    }
    for (const [flag, value] of Object.entries(args)) {
        if (!value) throw new Error(`--${flag} <dir> requires a value`);
    }
    return args;
}

/** Every HTML document in `dir`, as paths relative to `tree`. */
function htmlPages(tree, dir) {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
        .map((entry) => relative(tree, join(entry.parentPath, entry.name)));
}

const { examples, build } = parseArgs(process.argv.slice(2));

if (!existsSync(examples)) {
    console.error(
        `place-examples: no examples build output at ${examples} — ` +
            'run `pnpm build:examples` first.',
    );
    process.exit(1);
}
if (!existsSync(build)) {
    console.error(
        `place-examples: no site build output at ${build} — ` +
            'this step runs after `vite build`.',
    );
    process.exit(1);
}

// Replaced wholesale rather than merged: a page deleted from an example would
// otherwise be served from the previous build forever.
const placed = readdirSync(examples);
for (const entry of placed) {
    rmSync(join(build, entry), { recursive: true, force: true });
    cpSync(join(examples, entry), join(build, entry), { recursive: true });
}

const broken = placed.flatMap((entry) => {
    const dir = join(build, entry);
    return htmlPages(build, dir).flatMap((page) =>
        unresolvedTargets(build, page, readFileSync(join(build, page), 'utf8')),
    );
});

if (broken.length > 0) {
    console.error(
        `\nplace-examples: ${broken.length} reference(s) in the placed examples ` +
            'resolve to nothing in the build output:',
    );
    for (const { page, target, landing } of broken) {
        console.error(
            `  ${page}: "${target}" -> ${relative(build, landing) || '.'}`,
        );
    }
    console.error(
        '    The examples are published as `examples/<name>/` beside `dist/`, and ' +
            'the no-build pages reach the release bundles with `../../dist/…`. Either ' +
            'the examples build did not produce `dist/` (its `build:bundles` step ' +
            'copies the real package output) or that layout has moved.',
    );
    process.exit(1);
}

console.log(
    `place-examples: ${placed.join(', ')} -> ${relative(REPO_ROOT, build)}`,
);
