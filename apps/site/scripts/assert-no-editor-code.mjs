#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
/*
 * Names the editor stack cannot be bundled without, and that nothing else in the
 * tree carries.
 *
 * The ProseMirror marker is its class-name prefix rather than the bare word:
 * `ProseMirror-focused`, `ProseMirror-hideselection` and their siblings are
 * string literals in prosemirror-view and survive minification, while the bare
 * word also appears in a validation message Uncial's renderer ships — which is
 * prose about a document format, not a copy of the library.
 */
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
