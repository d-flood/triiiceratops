#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
/* `ProseMirror-` prefix survives minification; the bare word also matches Uncial prose. */
const EDITOR_STACK_MARKERS = [
    ['tiptap', /tiptap/i],
    ['ProseMirror-', /ProseMirror-/],
    ['uncial-editor', /uncial-editor/],
];

function filesIn(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...filesIn(path));
        else if (entry.isFile()) files.push(path);
    }
    return files;
}

function main() {
    const build = resolve(process.argv[2] ?? join(APP_ROOT, 'build'));
    if (!existsSync(build)) {
        throw new Error(
            `assert-no-editor-code: expected build output at ${build}`,
        );
    }

    const matches = [];
    for (const file of filesIn(build)) {
        const text = readFileSync(file, 'utf8');
        for (const [name, marker] of EDITOR_STACK_MARKERS) {
            if (marker.test(text))
                matches.push(`${relative(build, file)}: ${name}`);
        }
    }

    if (matches.length > 0) {
        console.error(
            `assert-no-editor-code: editor-stack markers found in production output:\n${matches.join('\n')}`,
        );
        process.exitCode = 1;
    }
}

main();
