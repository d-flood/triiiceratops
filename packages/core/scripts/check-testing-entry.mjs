/**
 * Guard the `triiiceratops/testing` entry's BUILT module graph.
 *
 * The consumer testing helper's whole point is that a React or Vue application
 * can unit-test its own viewer-reading components in whatever runner it already
 * has. That promise is about the published artifact, not the source: the source
 * legitimately imports `svelte` (`flushSync`), and `vite.config.testing.ts`
 * compiles Svelte away and bundles its runtime so the shipped chunk does not.
 *
 * So this walks `dist/testing/index.js` — the real artifact `build:testing`
 * just produced — and fails if any bare specifier in its graph is React, Vue,
 * or Svelte. Run at the END of `build:testing`, because nothing earlier in the
 * pipeline has produced the compiled chunk yet (`svelte-package` leaves an
 * UNCOMPILED copy there that this check would rightly reject).
 *
 * It also guards the one module the entry must NOT bundle. `createTestViewerHandle()`
 * publishes its selector runtime into the module-level `WeakMap` in
 * `framework/runtimeRegistry.js`, and `triiiceratops/react` / `triiiceratops/vue`
 * read it back out of that same `WeakMap`. Those entries are separate build
 * outputs, so a bundled copy would give the testing entry a private registry and
 * `useViewerSelector()` would resolve no runtime for a test handle — `undefined`
 * forever in the published package, while source-resolved unit tests stayed
 * green. `vite.config.testing.ts` keeps it external; this asserts the artifact
 * actually says so.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const entryFile = path.join(distDir, 'testing', 'index.js');

/** A bare specifier is forbidden when one of these matches it. */
const FORBIDDEN = [
    /^react(\/|$)/,
    /^react-dom(\/|$)/,
    /^vue(\/|$)/,
    /^@vue\//,
    /^svelte(\/|$)/,
];

/**
 * Minified ESM shapes: `import x from"y"`, `export{a}from"y"`, `import"y"`,
 * and `import("y")`. Matching the three of them by specifier position is more
 * robust on minified output than trying to parse statements.
 */
const SPECIFIER_PATTERNS = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
];

/**
 * Modules the entry must IMPORT rather than inline, because a second copy would
 * be a second module-level identity. Keyed by the exact specifier the entry
 * chunk has to contain.
 */
const SHARED_IDENTITY_IMPORTS = [
    {
        specifier: '../framework/runtimeRegistry.js',
        why:
            'its module-level WeakMap is how createTestViewerHandle() hands a ' +
            'selector runtime to triiiceratops/react and triiiceratops/vue; a ' +
            'bundled copy makes useViewerSelector() return undefined forever',
    },
];

const visited = new Set();
const bare = new Set();
const violations = [];
const entrySpecifiers = new Set();

async function visit(filePath) {
    const normalized = path.resolve(filePath);
    if (visited.has(normalized)) return;
    visited.add(normalized);

    const source = await readFile(normalized, 'utf8');

    const specifiers = new Set();
    for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
    }
    if (normalized === path.resolve(entryFile)) {
        for (const specifier of specifiers) entrySpecifiers.add(specifier);
    }

    for (const specifier of specifiers) {
        if (specifier.startsWith('.')) {
            if (!specifier.endsWith('.js')) continue;
            await visit(path.resolve(path.dirname(normalized), specifier));
            continue;
        }
        bare.add(specifier);
        if (FORBIDDEN.some((pattern) => pattern.test(specifier))) {
            violations.push({ filePath: normalized, specifier });
        }
    }
}

await visit(entryFile);

if (violations.length > 0) {
    const details = violations
        .map(
            ({ filePath, specifier }) =>
                `- ${path.relative(process.cwd(), filePath)} imports ${specifier}`,
        )
        .join('\n');
    throw new Error(
        `The triiiceratops/testing entry graph must not reach React, Vue, or ` +
            `Svelte:\n${details}`,
    );
}

const inlined = SHARED_IDENTITY_IMPORTS.filter(
    ({ specifier }) => !entrySpecifiers.has(specifier),
);
if (inlined.length > 0) {
    const details = inlined
        .map(({ specifier, why }) => `- ${specifier} — ${why}`)
        .join('\n');
    throw new Error(
        `The triiiceratops/testing entry must IMPORT these modules, not bundle ` +
            `a private copy of them:\n${details}\n` +
            `Check the shared-identity externals in vite.config.testing.ts.`,
    );
}

const listed = [...bare].sort().join(', ') || 'nothing';
console.log(
    `triiiceratops/testing graph (${visited.size} file(s)) imports no React, ` +
        `Vue, or Svelte specifier. Bare imports: ${listed}.`,
);
