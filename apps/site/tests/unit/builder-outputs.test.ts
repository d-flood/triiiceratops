/**
 * The builder's three handoffs: the share URL, the configuration object and the
 * per-framework snippet.
 *
 * The claim each snippet makes is that a reader can paste it and be running, so
 * every one is held to the guide that documents the same framework: the import
 * specifier and the element or component name are read out of
 * `apps/site/content/docs/`, not written twice. A guide that renames its entry
 * point fails here rather than shipping a snippet that resolves to nothing.
 *
 * The sparse rule is the other half. A key the reader never touched must not
 * appear in any of the three, and a snippet for a reader who set nothing is the
 * bare embed — which is the argument the page exists to make.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    FRAMEWORKS,
    objectText,
    snippet,
    type FrameworkId,
} from '../../src/lib/builder/outputs';

/** Every code block of a documentation page, as text. */
function codeBlocks(slug: string): string[] {
    const doc = JSON.parse(
        readFileSync(
            fileURLToPath(
                new URL(`../../content/docs/${slug}.json`, import.meta.url),
            ),
            'utf8',
        ),
    ) as unknown;

    const found: string[] = [];
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        if (record.type === 'codeBlock' && Array.isArray(record.content)) {
            found.push(
                record.content
                    .map((part) =>
                        typeof (part as { text?: unknown }).text === 'string'
                            ? (part as { text: string }).text
                            : '',
                    )
                    .join(''),
            );
        }
        for (const value of Object.values(record)) walk(value);
    };
    walk(doc);
    return found;
}

/** The labels of a documentation page's framework tab group. */
function frameworkTabLabels(slug: string): string[][] {
    const doc = JSON.parse(
        readFileSync(
            fileURLToPath(
                new URL(`../../content/docs/${slug}.json`, import.meta.url),
            ),
            'utf8',
        ),
    ) as unknown;

    const found: string[][] = [];
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const child of node) walk(child);
            return;
        }
        if (!node || typeof node !== 'object') return;
        const record = node as Record<string, unknown>;
        const attrs = (record.attrs ?? {}) as Record<string, unknown>;
        if (record.type === 'tabs' && attrs.group === 'framework') {
            found.push(
                (record.content as Record<string, unknown>[]).map(
                    (tab) =>
                        ((tab.attrs as Record<string, unknown>).label ??
                            '') as string,
                ),
            );
        }
        for (const value of Object.values(record)) walk(value);
    };
    walk(doc);
    return found;
}

const MANIFEST = 'https://example.org/iiif/manifest.json';

const nothing = { manifestId: MANIFEST, config: {}, themeConfig: {} };
const something = {
    manifestId: MANIFEST,
    config: { gallery: { open: true }, toolbar: { showSearch: false } },
    themeConfig: { primary: '#123456' },
};

const ids = FRAMEWORKS.map((framework) => framework.id);

describe('the frameworks offered', () => {
    it('are only ones the documentation covers', () => {
        for (const framework of FRAMEWORKS) {
            expect(codeBlocks(framework.doc).length).toBeGreaterThan(0);
        }
    });

    it('offers the same set the documentation’s framework tabs do', () => {
        // The snippet block is that tab group, on this route. A framework the
        // guides tab between and this page does not offer would leave a reader
        // who picked it in a guide arriving here on somebody else's.
        const documented = frameworkTabLabels('configuration');
        expect(documented.length).toBeGreaterThan(0);
        for (const labels of documented) {
            expect(new Set(labels)).toEqual(
                new Set(FRAMEWORKS.map((framework) => framework.label)),
            );
        }
    });

    it('links each to the guide it follows', () => {
        for (const framework of FRAMEWORKS) {
            expect(framework.href).toBe(`/docs/${framework.doc}/`);
        }
    });
});

describe('every snippet', () => {
    it('carries the reader’s own manifest', () => {
        for (const id of ids) {
            expect(snippet(id, something)).toContain(MANIFEST);
        }
    });

    it('uses the entry point its own guide documents', () => {
        for (const framework of FRAMEWORKS) {
            const documented = codeBlocks(framework.doc).join('\n');
            expect(documented).toContain(framework.entry);
            expect(snippet(framework.id, something)).toContain(framework.entry);
        }
    });

    it('carries only the keys the reader set', () => {
        for (const id of ids) {
            const text = snippet(id, something);
            expect(text).toContain('showSearch');
            expect(text).toContain('#123456');
            // Set by nobody: a default the builder starts from must not travel.
            expect(text).not.toContain('leftPanelWidth');
            expect(text).not.toContain('showFullscreen');
        }
    });

    it('is the bare embed when the reader has set nothing', () => {
        for (const id of ids) {
            const text = snippet(id, nothing);
            expect(text).not.toContain('config');
            expect(text).not.toContain('themeConfig');
            expect(text).toContain(MANIFEST);
        }
    });

    it('omits the theming half on its own when no token was set', () => {
        for (const id of ids) {
            const text = snippet(id, { ...something, themeConfig: {} });
            expect(text).toContain('showSearch');
            expect(text.toLowerCase()).not.toContain('theme-config');
            expect(text).not.toContain('themeConfig');
        }
    });
});

describe('the three framework snippets', () => {
    const frameworks = ids.filter((id) => id !== 'html');

    it('write the configuration as a JavaScript literal, not as JSON', () => {
        for (const id of frameworks) {
            const text = snippet(id, something);
            // Quoted keys parse, and then the reader's own formatter rewrites
            // them on the first save. A snippet should paste in finished.
            expect(text).toContain('showSearch: false');
            expect(text).not.toContain('"showSearch"');
        }
    });
});

describe('the custom-element snippet', () => {
    const html = (id: FrameworkId = 'html') => snippet(id, something);

    it('puts the configuration in the attributes the element declares', () => {
        expect(html()).toContain("config='");
        expect(html()).toContain("theme-config='");
    });

    it('escapes what would otherwise close the attribute', () => {
        const text = snippet('html', {
            ...nothing,
            manifestId: "https://example.org/it's.json",
        });
        expect(text).toContain('&#39;');
        expect(text).not.toContain("it's");
    });
});

describe('the configuration object', () => {
    it('is JSON a reader can paste into a content system', () => {
        const text = objectText(something.config);
        expect(JSON.parse(text)).toEqual(something.config);
        // Indented, because this one is read as much as it is pasted.
        expect(text).toContain('\n    ');
    });
});
