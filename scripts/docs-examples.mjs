#!/usr/bin/env node
// Extracts compilable doc examples into the packed-consumer fixture for `tsc`.

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

/** The `<script setup lang="ts">` body of a Vue block, or `null`. */
function scriptSetupTs(sfc) {
    for (const match of sfc.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
        const attributes = match[1];
        if (!/\bsetup\b/.test(attributes)) continue;
        if (!/\blang\s*=\s*["']ts["']/.test(attributes)) continue;
        return match[2].replace(/^\n+/, '');
    }
    return null;
}

// Stubs for reader-owned relative imports so they resolve during type-check.
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

/** Recursively collect content documents. */
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

function blockText(node) {
    return (node.content ?? [])
        .filter(
            (child) => child?.type === 'text' && typeof child.text === 'string',
        )
        .map((child) => child.text)
        .join('');
}

function slug(file, contentDir) {
    return relative(contentDir, file)
        .replace(/\.json$/, '')
        .replace(/[\\/]/g, '-');
}

/** Every compilable example in one document. */
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

/** Extract every compilable example. */
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
