#!/usr/bin/env node
// Doc-example extractor.
//
// Walks every content document under `apps/site/content` for code blocks whose
// declared language is `ts`, `tsx` or `js` and whose body imports package code
// (`triiiceratops` or `@triiiceratops/*`), and writes each one as a standalone
// source file under the `docs-examples` packed-consumer fixture. Those files are
// type-checked with `tsc` against the PACKED tarballs by `pnpm test:packed`, so
// published guidance provably matches what users can install.
//
// The language is a block attribute rather than a fence's info string, so no
// aliases are accepted here: `apps/site/tests/unit/docs-content.test.ts` pins
// the set the content declares, and a block declaring a language outside
// `EXT_BY_LANG` is prose about code rather than compiled guidance. `jsx` is
// deliberately outside it — a JSX sample that is JavaScript rather than
// TypeScript is not guidance a strict `tsc` can hold to its word.
//
// A `vue` block additionally contributes its `<script setup lang="ts">` body as
// a `.ts` file, so the Vue guide's single-file-component examples are idiomatic
// documentation AND compiled guidance. Only `lang="ts"` script-setup blocks are
// extracted, and the body must stand alone as a module: use no compiler macros
// (`defineProps`, `defineEmits`, …) in a block you want checked. A `vue` block
// with no TypeScript script setup — a template-only snippet, or a plain
// `<script setup>` — is skipped.
//
// A block opts OUT with an `exampleIgnore` attribute, for a sample that is
// deliberately not the thing a reader should compile — a "before" in a migration
// note, say. The attribute is not part of the editor's schema, so a document
// saved from the editor loses it; the loss is loud rather than silent, because
// the next `--check` reports the newly-extracted file as missing.
//
// Usage:
//   node scripts/docs-examples.mjs           # (re)generate the fixture sources
//   node scripts/docs-examples.mjs --check   # fail if the committed output is stale
//
// The generated files are committed so the packed harness can compile them
// without reaching back into the repo. `--check` (run in the docs CI job) keeps
// them in sync with the content.

import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const CONTENT_DIR = join(REPO_ROOT, 'apps', 'site', 'content');
const OUT_DIR = join(
    REPO_ROOT,
    'test-consumers',
    'fixtures',
    'docs-examples',
    'generated',
);

const EXT_BY_LANG = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
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

/** Recursively collect the content documents under a content directory. */
function contentDocuments(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...contentDocuments(full));
        else if (entry.name.endsWith('.json')) out.push(full);
    }
    return out.sort();
}

/** Every code block in a document, in document order. */
function codeBlocks(nodes) {
    const found = [];
    for (const node of nodes ?? []) {
        if (node?.type === 'codeBlock') found.push(node);
        if (Array.isArray(node?.content))
            found.push(...codeBlocks(node.content));
    }
    return found;
}

/** A code block's source: its text, with no marks and no inline nodes. */
function blockText(node) {
    return (node.content ?? [])
        .filter(
            (child) => child?.type === 'text' && typeof child.text === 'string',
        )
        .map((child) => child.text)
        .join('');
}

/** A short, stable slug for a content document, mirroring its path. */
function slug(file, contentDir) {
    return relative(contentDir, file)
        .replace(/\.json$/, '')
        .replace(/[\\/]/g, '-');
}

/**
 * Every compilable example in one document. Returns a Map<filename, contents>,
 * numbered in document order.
 */
export function examplesInDocument(document, base, source) {
    const files = new Map();
    let n = 0;
    for (const block of codeBlocks(document.content)) {
        const language = block.attrs?.language;
        let ext = EXT_BY_LANG[language];
        let body = blockText(block);
        if (language === 'vue') {
            const script = scriptSetupTs(body);
            if (script === null) continue;
            ext = 'ts';
            body = script;
        }
        if (!ext) continue;
        if (!IMPORTS_PACKAGE.test(body)) continue;
        if (block.attrs?.exampleIgnore) continue;
        n += 1;
        const header =
            `// GENERATED from ${source} — do not edit by hand.\n` +
            `// Regenerate with: node scripts/docs-examples.mjs\n`;
        files.set(
            `${base}-${String(n).padStart(2, '0')}.${ext}`,
            `${header}${body.replace(/\s*$/, '')}\n`,
        );
    }
    return files;
}

/** Extract every compilable example. Returns a Map<filename, contents>. */
export function extractDocExamples(contentDir = CONTENT_DIR) {
    const files = new Map();
    for (const file of contentDocuments(contentDir)) {
        const document = JSON.parse(readFileSync(file, 'utf8'));
        const source = relative(REPO_ROOT, file).replace(/\\/g, '/');
        for (const [name, contents] of examplesInDocument(
            document,
            slug(file, contentDir),
            source,
        )) {
            files.set(name, contents);
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
            'docs-examples: the generated fixture is out of sync with the ' +
                "site's content.\n" +
                'Run `node scripts/docs-examples.mjs` and commit the result.\n',
        );
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
    }
    console.log(`docs-examples: ${wanted.size} example(s) in sync.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
