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
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
