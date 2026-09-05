import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(
    new URL('../../scripts/assert-no-editor-code.mjs', import.meta.url),
);
const builds: string[] = [];

function createBuild(): string {
    const build = mkdtempSync(join(tmpdir(), 'triiiceratops-site-build-'));
    mkdirSync(join(build, 'assets'));
    builds.push(build);
    return build;
}

function runGate(build: string) {
    return spawnSync(process.execPath, [SCRIPT, build], { encoding: 'utf8' });
}

afterEach(() => {
    for (const build of builds.splice(0))
        rmSync(build, { recursive: true, force: true });
});

describe('the production editor-output gate', () => {
    it('accepts a built output without editor-stack markers', () => {
        const build = createBuild();
        writeFileSync(
            join(build, 'assets', 'app.js'),
            'console.log("reader page");',
        );

        const result = runGate(build);

        expect(result.status, result.stderr).toBe(0);
    });

    it('accepts the renderer talking about ProseMirror documents', () => {
        const build = createBuild();
        writeFileSync(
            join(build, 'assets', 'render.js'),
            'message:"Document root must be a ProseMirror doc node"',
        );

        const result = runGate(build);

        expect(result.status, result.stderr).toBe(0);
    });

    it('rejects every editor-stack marker in a built asset', () => {
        const build = createBuild();
        writeFileSync(
            join(build, 'assets', 'editor.js'),
            'tiptap ProseMirror-focused uncial-editor',
        );

        const result = runGate(build);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('tiptap');
        expect(result.stderr).toContain('ProseMirror-');
        expect(result.stderr).toContain('uncial-editor');
    });
});
