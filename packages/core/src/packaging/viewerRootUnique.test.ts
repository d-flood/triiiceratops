import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/*
 * INVARIANT: `.viewer-root` marks the viewer ROOT element and nothing else.
 *
 * The published light-DOM stylesheet (`triiiceratops/style.css`) is produced by
 * scopeViewerRoot.ts, which rewrites `:where(:root, :host)` into
 * `:where(.viewer-root)`. That turns the base token block into a real
 * DECLARATION of every `--tri-*` / `--ui-*` token on any element carrying the
 * class. A declaration beats inheritance, so a NESTED element with the class
 * shadows the real root's `[data-theme=…]` block and its `themeConfig` inline
 * styles — the whole subtree silently falls back to the stock light theme.
 *
 * That is exactly the bug this test guards: the renderer's wrapper used to
 * render `class="viewer-root"`, so the canvas surface painted the light
 * `--tri-viewer-bg` no matter what theme the consumer asked for. Only visible
 * in the packaged light-DOM build (dev/source and the shadow-DOM element build
 * never run the scoping transform), so a static source guard is the cheapest
 * place to catch a regression.
 *
 * Nested VIEWERS (a viewer mounted inside another viewer's plugin panel) are a
 * legitimate runtime case with two `.viewer-root` elements — each needs its own
 * token declarations. That's why this guard is markup-level (one component may
 * render the class) rather than a runtime "only one in the document" check.
 */

// src/packaging → packages/core → packages → repo root
const PACKAGES = resolve(__dirname, '..', '..', '..');
const REPO = resolve(PACKAGES, '..');

const OWNER = resolve(
    PACKAGES,
    'core',
    'src',
    'lib',
    'components',
    'TriiiceratopsViewer.svelte',
);

function svelteFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (
            entry === 'node_modules' ||
            entry === 'dist' ||
            entry === '.svelte-kit'
        )
            continue;
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) svelteFiles(full, out);
        else if (entry.endsWith('.svelte')) out.push(full);
    }
    return out;
}

/** Blank out `<script>`/`<style>` blocks so only MARKUP is searched. */
function markupOnly(source: string): string {
    return source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, (block) =>
        block.replace(/[^\n]/g, ' '),
    );
}

/**
 * Every markup site that applies the `viewer-root` class:
 *   class="… viewer-root …"   class='…'   class:viewer-root   class={…}
 */
function classApplications(markup: string): number[] {
    const lines: number[] = [];
    const lineOf = (index: number) => markup.slice(0, index).split('\n').length;

    const staticAttr = /class\s*=\s*(["'])([\s\S]*?)\1/g;
    let m: RegExpExecArray | null;
    while ((m = staticAttr.exec(markup))) {
        if (m[2].split(/\s+/).includes('viewer-root'))
            lines.push(lineOf(m.index));
    }

    const directive = /class:viewer-root\b/g;
    while ((m = directive.exec(markup))) lines.push(lineOf(m.index));

    const expr = /class\s*=\s*\{([\s\S]*?)\}/g;
    while ((m = expr.exec(markup))) {
        if (/\bviewer-root\b/.test(m[1])) lines.push(lineOf(m.index));
    }

    return [...new Set(lines)].sort((a, b) => a - b);
}

describe('`viewer-root` is applied by exactly one component', () => {
    it('only TriiiceratopsViewer renders the class, exactly once', () => {
        const sites: string[] = [];
        for (const file of svelteFiles(PACKAGES)) {
            const markup = markupOnly(readFileSync(file, 'utf8'));
            for (const line of classApplications(markup)) {
                sites.push(
                    `${relative(REPO, file).split(sep).join('/')}:${line}`,
                );
            }
        }

        const owner = relative(REPO, OWNER).split(sep).join('/');
        expect(
            sites.map((s) => s.replace(/:\d+$/, '')),
            `Only the viewer root may carry \`viewer-root\` — the published\n` +
                `light-DOM sheet DECLARES every base token on that class, so a\n` +
                `nested one shadows the root's theme. Application sites found:\n` +
                sites.join('\n'),
        ).toEqual([owner]);
    });
});
