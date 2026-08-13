/**
 * Guard the PUBLISHED `triiiceratops/react` and `triiiceratops/vue` artifacts.
 *
 * The central promise is that a React or Vue application installs
 * `triiiceratops` and its own framework, and NOTHING else — no `svelte`, no
 * `@sveltejs/*`, and not the other framework either. That promise is about the
 * built artifacts, not the source, and it is PER ENTRY POINT: core's `.` entry
 * deliberately targets Svelte consumers (see `SVELTE_CONSUMER_SUBPATHS` in
 * `src/packaging/dtsSvelteImports.ts`), so a whole-package assertion would be
 * both wrong and unenforceable.
 *
 * So this walks each framework subpath's real runtime module graph — the file
 * `package.json#exports` actually points a bundler at — and fails when it
 * reaches a forbidden bare specifier.
 *
 * Three things keep it from passing vacuously:
 *
 *   1. Each entry must REACH its own peer (`react` / `vue`). An entry emptied
 *      out by a bad build would otherwise satisfy "imports no Svelte" trivially.
 *   2. Each entry must reach `dist/triiiceratops-element.js`, the self-contained
 *      element bundle the substrate lazy-loads by RELATIVE specifier. That is
 *      also why this runs at the end of `build:element` rather than `build:lib`:
 *      `svelte-package` clears `dist/`, and a `build:lib` that is not followed
 *      by `build:element` leaves a published tree whose wrappers fail at first
 *      mount (see `check-element-artifact.mjs`).
 *   3. A relative import that resolves to nothing is a failure, not a silently
 *      short walk.
 *
 * Svelte lives behind the custom-element boundary, INSIDE that bundle — bundled,
 * not imported — which is why the bundle is walked like any other file and is
 * expected to declare no specifiers at all.
 *
 * The declaration side of the same promise is enforced by
 * `check:dts-svelte-types` at the end of `build:lib`, which holds every subpath
 * except `.` to a strict, allowance-free Svelte-free rule.
 *
 * Run directly: `node ./scripts/check-framework-entries.mjs`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(packageDir, 'dist');

/** Any specifier a consumer could only resolve with Svelte installed. */
const SVELTE_SPECIFIER_RE = /^(svelte(\/|$)|@sveltejs\/)/;

/** The element bundle both wrappers must reach through the substrate. */
const ELEMENT_BUNDLE = path.join(distDir, 'triiiceratops-element.js');

/**
 * The framework subpaths, each with the optional peer it is allowed to need and
 * the peers it must NOT — installing React must never oblige a consumer to
 * install Vue, and vice versa.
 */
const FRAMEWORK_ENTRIES = [
    {
        subpath: './react',
        requiredPeer: /^react(\/|$)/,
        requiredPeerLabel: 'react',
        foreignPeer: /^(vue(\/|$)|@vue\/)/,
        foreignPeerLabel: 'vue',
    },
    {
        subpath: './vue',
        requiredPeer: /^vue(\/|$)/,
        requiredPeerLabel: 'vue',
        foreignPeer: /^react(-dom)?(\/|$)/,
        foreignPeerLabel: 'react',
    },
];

const manifest = JSON.parse(
    readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
);

const problems = [];
const summaries = [];

/** Dist-relative POSIX path, for messages. */
const rel = (filePath) =>
    path.relative(distDir, filePath).split(path.sep).join('/');

/**
 * Every module specifier in one JS file, from the TypeScript AST rather than a
 * regex. `svelte-package` preserves doc comments, and both wrapper entries carry
 * usage examples containing literal `from 'triiiceratops/vue'` lines — a regex
 * scan reports those as real imports.
 */
function collectModuleSpecifiers(filePath) {
    const sourceFile = ts.createSourceFile(
        filePath,
        readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        /* setParentNodes */ false,
        ts.ScriptKind.JS,
    );

    const specifiers = [];
    const visit = (node) => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
        } else if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length > 0 &&
            ts.isStringLiteral(node.arguments[0])
        ) {
            specifiers.push(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return specifiers;
}

/** Walk one entry's runtime graph. Returns { visited, bare, unresolved }. */
function walkRuntimeGraph(entryFile) {
    const visited = new Set();
    const bare = new Set();
    const unresolved = [];

    const visit = (filePath) => {
        const normalized = path.resolve(filePath);
        if (visited.has(normalized)) return;
        visited.add(normalized);

        for (const specifier of collectModuleSpecifiers(normalized)) {
            if (!specifier.startsWith('.')) {
                bare.add(specifier);
                continue;
            }
            const resolved = path.resolve(path.dirname(normalized), specifier);
            if (!existsSync(resolved)) {
                unresolved.push({ file: rel(normalized), specifier });
                continue;
            }
            visit(resolved);
        }
    };

    visit(entryFile);
    return { visited, bare, unresolved };
}

for (const entry of FRAMEWORK_ENTRIES) {
    const condition = manifest.exports?.[entry.subpath];
    if (typeof condition !== 'object' || condition === null) {
        problems.push(
            `package.json#exports has no "${entry.subpath}" subpath — the framework wrapper is not published.`,
        );
        continue;
    }

    // Both conditions are part of the contract: precompiled JS AND declarations.
    let targetsOk = true;
    for (const key of ['types', 'import']) {
        const target = condition[key];
        if (typeof target !== 'string') {
            problems.push(
                `package.json#exports["${entry.subpath}"] has no "${key}" condition.`,
            );
            targetsOk = false;
            continue;
        }
        if (!existsSync(path.resolve(packageDir, target))) {
            problems.push(
                `package.json#exports["${entry.subpath}"].${key} points at ${target}, which does not exist. ` +
                    'Run `pnpm build:lib` then `pnpm build:element`.',
            );
            targetsOk = false;
        }
    }
    if (!targetsOk) continue;

    const entryFile = path.resolve(packageDir, condition.import);
    const { visited, bare, unresolved } = walkRuntimeGraph(entryFile);

    for (const { file, specifier } of unresolved) {
        problems.push(
            `${entry.subpath}: ${file} imports "${specifier}", which is not in dist — the graph walk is incomplete.`,
        );
    }

    for (const specifier of bare) {
        if (SVELTE_SPECIFIER_RE.test(specifier)) {
            problems.push(
                `${entry.subpath}: the built graph imports "${specifier}". A framework consumer installs no \`svelte\` package.`,
            );
        }
        if (entry.foreignPeer.test(specifier)) {
            problems.push(
                `${entry.subpath}: the built graph imports "${specifier}". ` +
                    `\`${entry.foreignPeerLabel}\` is an OPTIONAL peer a ${entry.requiredPeerLabel} consumer does not install.`,
            );
        }
    }

    if (![...bare].some((specifier) => entry.requiredPeer.test(specifier))) {
        problems.push(
            `${entry.subpath}: the built graph never imports \`${entry.requiredPeerLabel}\`. ` +
                'That is not a wrapper — the no-Svelte assertion would be vacuous.',
        );
    }

    if (!visited.has(ELEMENT_BUNDLE)) {
        problems.push(
            `${entry.subpath}: the built graph never reaches ${rel(ELEMENT_BUNDLE)}. ` +
                'Either the substrate stopped lazy-loading the element bundle by relative specifier, ' +
                'or `build:element` has not run since the last `build:lib` (which clears dist/).',
        );
    }

    summaries.push(
        `${entry.subpath}: ${visited.size} module(s), bare imports: ${[...bare].sort().join(', ') || 'none'}`,
    );
}

if (problems.length > 0) {
    console.error(
        'check-framework-entries: the framework subpaths are not publishable\n',
    );
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
}

console.log(
    `check-framework-entries: no Svelte and no cross-framework specifier in the built wrapper graphs.\n  ${summaries.join('\n  ')}`,
);
