#!/usr/bin/env node
// Doc-example extractor (ticket 26).
//
// Extracts every fenced `ts` / `tsx` / `js` code block in `docs/**/*.md` that
// imports package code (`triiiceratops` or `@triiiceratops/*`) into standalone
// source files under the `docs-examples` packed-consumer fixture. Those files
// are type-checked with `tsc` against the PACKED tarballs by `pnpm test:packed`,
// so published guidance provably matches what users can install.
//
// A fenced `vue` block additionally contributes its `<script setup lang="ts">`
// body as a `.ts` file (ticket 11), so the Vue guide's single-file-component
// examples are idiomatic Markdown AND compiled guidance. Only `lang="ts"`
// script-setup blocks are extracted, and the body must stand alone as a module:
// use no compiler macros (`defineProps`, `defineEmits`, …) in a block you want
// checked. A `vue` block with no TypeScript script setup — a template-only
// snippet, or a plain `<script setup>` — is skipped exactly as before.
//
// A block opts OUT with a first line of `// example-ignore` (used only for the
// migration guide's intentionally-removed "before" samples). For a `vue` block
// the marker goes on the first line inside the script.
//
// Usage:
//   node scripts/docs-examples.mjs           # (re)generate the fixture sources
//   node scripts/docs-examples.mjs --check   # fail if the committed output is stale
//
// The generated files are committed so the packed harness can compile them
// without reaching back into the repo. `--check` (run in the docs CI job) keeps
// them in sync with the Markdown.

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
const DOCS_DIR = join(REPO_ROOT, 'docs');
const OUT_DIR = join(
    REPO_ROOT,
    'test-consumers',
    'fixtures',
    'docs-examples',
    'generated',
);

// Build artifacts / non-authored trees under docs/ that must never be scanned.
const SKIP_DIRS = new Set([
    'viewer',
    'demo-consumer',
    'demo',
    'svelte-demo',
    'media',
]);

const EXT_BY_LANG = {
    ts: 'ts',
    typescript: 'ts',
    tsx: 'tsx',
    js: 'js',
    javascript: 'js',
};

const IMPORTS_PACKAGE =
    /(?:from|import)\s+['"]@?triiiceratops(?:\/[\w./-]+)?['"]/;

/**
 * The `<script setup lang="ts">` body of a Vue single-file-component block, or
 * `null` when the block has none (template-only snippets, plain-JS setups).
 */
function scriptSetupTs(sfc) {
    for (const match of sfc.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        const attributes = match[1];
        if (!/\bsetup\b/.test(attributes)) continue;
        if (!/\blang\s*=\s*["']ts["']/.test(attributes)) continue;
        return match[2].replace(/^\n+/, '');
    }
    return null;
}

// Loosely-typed stub modules for the reader-owned local files that examples
// import by relative path (e.g. "the `./my-plugin` you just wrote"). Committed
// alongside the extracted files so those relative imports resolve during the
// type-check without weakening any *package* import or public-API check.
const STUBS = {
    'my-plugin.ts':
        '// GENERATED stub for docs relative imports — do not edit by hand.\n' +
        'export function createExamplePlugin(): any {\n' +
        '    return undefined as any;\n' +
        '}\n',
    'MyAdapter.ts':
        '// GENERATED stub for docs relative imports — do not edit by hand.\n' +
        'export const MyAdapter: any = class {\n' +
        '    constructor(..._args: any[]) {}\n' +
        '};\n',
};

/** Recursively collect authored Markdown files under docs/. */
function markdownFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            if (SKIP_DIRS.has(entry)) continue;
            out.push(...markdownFiles(full));
        } else if (entry.endsWith('.md')) {
            out.push(full);
        }
    }
    return out.sort();
}

/** Parse fenced code blocks out of Markdown, tracking the opening info string. */
function fencedBlocks(markdown) {
    const lines = markdown.split('\n');
    const blocks = [];
    let open = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fence = line.match(/^(\s*)(`{3,})\s*([^\s{]*)/);
        if (!open && fence) {
            open = {
                indent: fence[1].length,
                ticks: fence[2],
                lang: (fence[3] || '').toLowerCase(),
                body: [],
            };
            continue;
        }
        if (open) {
            const close = line.match(/^(\s*)(`{3,})\s*$/);
            if (close && close[2].length >= open.ticks.length) {
                blocks.push(open);
                open = null;
                continue;
            }
            // Strip the leading fence indentation (tabbed content blocks).
            open.body.push(line.slice(open.indent));
        }
    }
    return blocks;
}

/** A short, stable slug for a docs file path. */
function slug(mdPath) {
    return relative(DOCS_DIR, mdPath)
        .replace(/\.md$/, '')
        .replace(/[\\/]/g, '-');
}

/** Extract every compilable example. Returns a Map<filename, contents>. */
export function extractDocExamples() {
    const files = new Map();
    for (const md of markdownFiles(DOCS_DIR)) {
        const base = slug(md);
        let n = 0;
        for (const block of fencedBlocks(readFileSync(md, 'utf8'))) {
            let ext = EXT_BY_LANG[block.lang];
            let body = block.body.join('\n');
            if (block.lang === 'vue') {
                const script = scriptSetupTs(body);
                if (script === null) continue;
                ext = 'ts';
                body = script;
            }
            if (!ext) continue;
            if (!IMPORTS_PACKAGE.test(body)) continue;
            const firstCode =
                body.split('\n').find((l) => l.trim().length > 0) ?? '';
            if (firstCode.trim() === '// example-ignore') continue;
            n += 1;
            const name = `${base}-${String(n).padStart(2, '0')}.${ext}`;
            const header =
                `// GENERATED from docs/${relative(DOCS_DIR, md)} — do not edit by hand.\n` +
                `// Regenerate with: node scripts/docs-examples.mjs\n`;
            files.set(name, `${header}${body.replace(/\s*$/, '')}\n`);
        }
    }
    for (const [name, contents] of Object.entries(STUBS)) {
        files.set(name, contents);
    }
    return files;
}

function readGenerated() {
    const out = new Map();
    if (!existsSync(OUT_DIR)) return out;
    for (const entry of readdirSync(OUT_DIR)) {
        if (entry === '.gitkeep') continue;
        out.set(entry, readFileSync(join(OUT_DIR, entry), 'utf8'));
    }
    return out;
}

function write(files) {
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, contents] of files) {
        writeFileSync(join(OUT_DIR, name), contents, 'utf8');
    }
}

function main() {
    const check = process.argv.includes('--check');
    const wanted = extractDocExamples();

    if (!check) {
        write(wanted);
        console.log(
            `docs-examples: wrote ${wanted.size} example(s) to ${relative(REPO_ROOT, OUT_DIR)}`,
        );
        return;
    }

    const have = readGenerated();
    const problems = [];
    for (const [name, contents] of wanted) {
        if (!have.has(name)) problems.push(`missing: ${name}`);
        else if (have.get(name) !== contents) problems.push(`stale: ${name}`);
    }
    for (const name of have.keys()) {
        if (!wanted.has(name)) problems.push(`orphaned: ${name}`);
    }
    if (problems.length) {
        console.error(
            'docs-examples: generated fixture is out of sync with docs/.\n' +
                'Run `node scripts/docs-examples.mjs` and commit the result.\n',
        );
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
    }
    console.log(`docs-examples: ${wanted.size} example(s) in sync.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
