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

const visited = new Set();
const bare = new Set();
const violations = [];

async function visit(filePath) {
    const normalized = path.resolve(filePath);
    if (visited.has(normalized)) return;
    visited.add(normalized);

    const source = await readFile(normalized, 'utf8');

    const specifiers = new Set();
    for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
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

const listed = [...bare].sort().join(', ') || 'nothing';
console.log(
    `triiiceratops/testing graph (${visited.size} file(s)) imports no React, ` +
        `Vue, or Svelte specifier. Bare imports: ${listed}.`,
);
