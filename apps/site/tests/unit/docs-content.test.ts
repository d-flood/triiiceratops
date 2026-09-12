/**
 * What the documentation has to be true of, as documents rather than as pages.
 *
 * Three of its properties are invisible in any single rendered page and easy to
 * regress one document at a time: that every code block declares a normalized
 * language,
 * which is what the doc-example gate keys on; that every heading carries a
 * persisted slug, which is what an inbound link lands on; and that a tab group
 * names one of the declared keys rather than inventing one.
 *
 * The fourth is about the repository rather than the documents: `docs/` is
 * internal, and a Markdown file appearing there would be a public page nobody
 * publishes.
 *
 * The fifth is narrower, and is here because there is nowhere better for it: the
 * AV page quotes its bundle sizes as prose and as a hand-written table, and
 * prose is the one thing on this site that no derivation reaches.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MEASURED_COMPARISON } from '@triiiceratops/comparison';
import { defaultMapPathToSource } from 'uncial-cms/sveltekit';
import { describe, expect, it } from 'vitest';

import { CALLOUT_KINDS, FRAMEWORK_GROUP, PLUGIN_UI_GROUP } from '$lib/content';
import { PACKAGE_MANAGER_GROUP } from '$lib/install';
import { CONTENT_ROUTES, DOC_ROUTES } from '$lib/routes';

const APP_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

type Node = {
    readonly type: string;
    readonly attrs?: Record<string, unknown>;
    readonly content?: readonly Node[];
    /** Present on a text node, and only on one. */
    readonly text?: string;
};

function documentAt(path: string): { readonly content: readonly Node[] } {
    const file = defaultMapPathToSource(path, `${APP_ROOT}content`);
    return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every node in a document, at every depth, with the route it came from. */
function nodesIn(paths: readonly string[]): { path: string; node: Node }[] {
    const found: { path: string; node: Node }[] = [];
    const walk = (path: string, nodes: readonly Node[]) => {
        for (const node of nodes) {
            found.push({ path, node });
            if (node.content) walk(path, node.content);
        }
    };
    for (const path of paths) walk(path, documentAt(path).content);
    return found;
}

/** A document's prose, in reading order, so a sentence split across text runs
 * and its marks reads as one string. */
function proseOf(path: string): string {
    const parts: string[] = [];
    const walk = (nodes: readonly Node[]) => {
        for (const node of nodes) {
            if (node.type === 'text') parts.push(node.text ?? '');
            if (node.content) walk(node.content);
        }
    };
    walk(documentAt(path).content);
    return parts.join('');
}

/** Every table in a document, as rows of plain-text cells. */
function tablesOf(path: string): string[][][] {
    const tables: string[][][] = [];
    const cellText = (node: Node): string => {
        const parts: string[] = [];
        const walk = (n: Node) => {
            if (n.type === 'text') parts.push(n.text ?? '');
            for (const child of n.content ?? []) walk(child);
        };
        walk(node);
        return parts.join('');
    };
    const walk = (nodes: readonly Node[]) => {
        for (const node of nodes) {
            if (node.type === 'table') {
                tables.push(
                    (node.content ?? []).map((row) =>
                        (row.content ?? []).map(cellText),
                    ),
                );
            }
            if (node.content) walk(node.content);
        }
    };
    walk(documentAt(path).content);
    return tables;
}

const CONTENT_PATHS = CONTENT_ROUTES.map((route) => route.path);
const NODES = nodesIn(CONTENT_PATHS);

function every(type: string) {
    return NODES.filter((entry) => entry.node.type === type);
}

/**
 * The languages a code block may declare. `typescript` and `javascript` are not
 * among them: the doc-example gate reads this attribute, so two spellings of one
 * language are two gates.
 *
 * `jsx` is not an alias of `tsx` and stays its own language. The gate extracts
 * `ts`, `tsx` and `js` and compiles them under `strict`; a JSX sample written as
 * JavaScript — the hand-wiring example whose own prose tells a TypeScript host
 * what more it must declare — is not guidance that compiles, and folding it into
 * `tsx` would make the gate demand that it does.
 */
const LANGUAGES = [
    'bash',
    'css',
    'html',
    'js',
    'json',
    'jsx',
    'plaintext',
    'ts',
    'tsx',
    'vue',
];

describe('every code block in the site’s content', () => {
    it('declares a language', () => {
        const undeclared = every('codeBlock')
            .filter(({ node }) => !node.attrs?.language)
            .map(({ path }) => path);
        expect(undeclared).toEqual([]);
    });

    it('declares one of the normalized languages, never an alias', () => {
        const declared = new Set(
            every('codeBlock').map(({ node }) => String(node.attrs?.language)),
        );
        expect([...declared].sort()).toEqual(
            LANGUAGES.filter((language) => declared.has(language)),
        );
    });
});

describe('every heading in the site’s content', () => {
    it('carries a persisted slug', () => {
        const unslugged = every('heading')
            .filter(({ node }) => typeof node.attrs?.slug !== 'string')
            .map(({ path }) => path);
        expect(unslugged).toEqual([]);
    });

    it('carries a slug unique within its own page, so an anchor is one target', () => {
        for (const path of CONTENT_PATHS) {
            const slugs = nodesIn([path])
                .filter(({ node }) => node.type === 'heading')
                .map(({ node }) => node.attrs?.slug);
            expect(new Set(slugs).size, path).toBe(slugs.length);
        }
    });
});

describe('every tab group in the site’s content', () => {
    it('names one of the declared keys rather than inferring one', () => {
        const keys = new Set(
            every('tabs').map(({ node }) => String(node.attrs?.group)),
        );
        expect([...keys].sort()).toEqual(
            [FRAMEWORK_GROUP, PACKAGE_MANAGER_GROUP, PLUGIN_UI_GROUP].sort(),
        );
    });

    it('holds only labelled panels', () => {
        for (const { path, node } of every('tabs')) {
            expect(node.content?.length, path).toBeGreaterThan(1);
            for (const tab of node.content ?? []) {
                expect(tab.type, path).toBe('tab');
                expect(String(tab.attrs?.label ?? ''), path).not.toBe('');
            }
        }
    });
});

describe('every callout in the site’s content', () => {
    it('declares one of the five kinds', () => {
        for (const { path, node } of every('callout')) {
            expect(CALLOUT_KINDS, path).toContain(node.attrs?.kind);
        }
    });
});

describe('the repository’s docs directory', () => {
    it('holds only internal material, and no page anybody publishes', () => {
        // The architecture decision records and the security notes, and nothing
        // else. They stay Markdown because they are append-only and written at
        // the moment of a decision: an edit button is exactly what they must not
        // acquire, and no route declaration can reach them.
        expect(readdirSync(`${REPO_ROOT}docs`).sort()).toEqual([
            'adr',
            'security',
        ]);
    });

    it('is not where the published documentation lives', () => {
        // Every declared documentation route resolves to a content document, so
        // no published page depends on this directory. `$lib/server/pageMeta`
        // already throws on a declared route with no document; what this adds is
        // that none of those documents is an empty shell.
        for (const route of DOC_ROUTES) {
            expect(
                documentAt(route.path).content.length,
                route.path,
            ).toBeGreaterThan(0);
        }
    });
});

/**
 * Whether a quoted kilobyte figure still describes the bytes measured.
 *
 * The page quotes at whatever precision reads well — `178`, `2.9`, `15.9` — so
 * the comparison is made at the precision quoted rather than at one this gate
 * picks. That keeps the gate out of the editorial decision and on the only
 * question it can answer: whether the number is still the measurement.
 */
function quotes(figure: string, bytes: number): boolean {
    const decimals = figure.split('.')[1]?.length ?? 0;
    return figure === (bytes / 1000).toFixed(decimals);
}

describe('the AV page’s bundle figures', () => {
    /*
     * `/size/` transcribes nothing — every figure on it is derived from the
     * measurement at build time. This page cannot be: its figures sit
     * mid-sentence, and the block vocabulary is block-level, so there is no
     * inline node for a computed value to render into. The sentences therefore
     * stay editable and this gate holds them to the same measurement, which is
     * the difference between a number a reader can trust and a number that was
     * true once.
     */
    const AV_PAGE = '/docs/plugin-av/';
    const av = MEASURED_COMPARISON.viewers.find(
        (viewer) => viewer.id === 'triiiceratops-av',
    );
    const session = av?.sessions[0];
    const plugin = session?.files.find((file) => file.name === 'iife.js');

    it('has a measurement to be held to', () => {
        // Without this, every assertion below passes by finding nothing.
        expect(plugin?.gzip, 'plugin-av iife.js').toBeGreaterThan(0);
        expect(session?.gzip, 'the measured pair').toBeGreaterThan(0);
        expect(av?.lazyArtifacts?.length, 'the lazy chunks').toBeGreaterThan(0);
    });

    it('quotes the plugin and the pair, and no third figure', () => {
        // Every occurrence, not merely one: the page states the plugin's size
        // twice, and a gate satisfied by either would let the other go stale.
        const quoted = [
            ...proseOf(AV_PAGE).matchAll(/(\d+(?:\.\d+)?) KB gzip/g),
        ].map((match) => match[1]);
        const stale = quoted.filter(
            (figure) =>
                !quotes(figure, plugin!.gzip) && !quotes(figure, session!.gzip),
        );
        expect(stale).toEqual([]);
        expect(quoted.some((f) => quotes(f, plugin!.gzip))).toBe(true);
        expect(quoted.some((f) => quotes(f, session!.gzip))).toBe(true);
    });

    it('sizes every lazy chunk as measured', () => {
        const rows = tablesOf(AV_PAGE)
            .flat()
            .filter((row) => row.length >= 2);
        for (const chunk of av!.lazyArtifacts ?? []) {
            const row = rows.find((cells) => cells[0] === chunk.name);
            expect(row, `a row for ${chunk.name}`).toBeDefined();
            const figure = row![1].replace(/^~/, '').replace(/ KB$/, '');
            expect(
                quotes(figure, chunk.gzip),
                `${chunk.name}: ${row![1]}`,
            ).toBe(true);
        }
    });
});
