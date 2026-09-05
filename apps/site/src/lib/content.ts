/**
 * The site's content layer: where a route's body lives, and the block
 * vocabulary it may use.
 *
 * A content route's body is one whole Uncial document, stored as normalized
 * JSON under `content/`, mirroring the site's paths through Uncial's default
 * mapping: `/handles/` is `content/handles.json`. `contentDir` is what the
 * storage backend addresses files by; `localContentDir` is the same directory as
 * a filesystem path from where Vite runs, which is this application's root.
 */
import { createBlockRegistry, createSchema } from 'uncial/core';
// The block factory from the runtime subpath rather than from Uncial's root: the
// root re-exports the editor, and no editor code may reach a production build.
import {
    defineSvelteBlock,
    type SvelteBlockComponent,
} from 'uncial/runtime/svelte';
// Uncial's own tab renderers, from the render subpath for the same reason.
import { Tab, Tabs } from 'uncial/render';
import type { UncialCmsSiteConfig } from 'uncial-cms';

import Callout from './Callout.svelte';
import ContentStateFixtureTable from './ContentStateFixtureTable.svelte';
import CssTokenTable from './CssTokenTable.svelte';
import DeploymentsList from './DeploymentsList.svelte';
import InstallBlock from './InstallBlock.svelte';
import OnwardList from './OnwardList.svelte';

export const siteConfig: UncialCmsSiteConfig = {
    forge: 'local',
    contentDir: 'content',
};

export const localContentDir = 'content';

/**
 * A page's own words, as document metadata.
 *
 * The heading and the lede are the two most-read pieces of prose on a page, so
 * they are content rather than TypeScript. The rail's label is here with them
 * because it names the same page: two places to rename a page is one place to
 * forget.
 */
const metaFields = {
    title: { default: '', required: true, placeholder: 'What it handles' },
    shortTitle: { default: '', required: true, placeholder: 'What it handles' },
    intro: {
        default: '',
        required: true,
        input: 'textarea',
        placeholder: 'One real sentence saying what the page is for.',
    },
} as const;

function isFilledString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The two axes a reader chooses along, and the third that is nobody's stack.
 *
 * A tab group's key is explicit, never inferred from its labels: inferring is
 * how a stray label silently forms a group of its own. The framework key and the
 * package-manager key are independent, so choosing Vue does not disturb somebody's
 * pnpm, and the package-manager key is the front page's install block's, so the
 * manager a reader picks there is the one the documentation shows them.
 *
 * `plugin-ui` is deliberately its own key rather than part of `framework`. Its
 * panel set is which framework you write a plugin's own UI in — Vanilla
 * JavaScript and Lit are on that axis and neither is on the other — and folding
 * it in would let a reader who picks Lit here find every other page's tabs
 * fallen back to their first panel.
 */
export const FRAMEWORK_GROUP = 'framework';
export const PLUGIN_UI_GROUP = 'plugin-ui';

/**
 * One conformance row, as `scripts/docs-content-state.mjs` writes it.
 *
 * The script owns these attributes, so the shape is declared where the block is
 * registered and the script is held to it by its own `--check`.
 */
export type ContentStateFixture = {
    readonly form: string;
    readonly resolvesVia: string;
    readonly file: string;
    readonly recipe: string | null;
    readonly capturedAt: string;
};

/** The five kinds of aside the documentation actually uses. */
export const CALLOUT_KINDS = [
    'note',
    'tip',
    'important',
    'warning',
    'info',
] as const;

/**
 * Derived blocks: placed in a document, rendered from code, with nothing
 * editable inside them.
 *
 * The four that carry no attributes at all each import the data module they
 * render, so there is no copy of that data in the document to drift from it.
 *
 * `contentStateFixtures` is the other kind: its attributes are written by
 * `scripts/docs-content-state.mjs`, because the fixture index it derives from is
 * package test material an application may not import. Being read-only is what
 * lets that script's `--check` compare the committed document against a
 * regeneration byte for byte.
 *
 * Tabs, tab and callout are containers rather than derived blocks: they hold
 * ordinary editable content and exist because the documentation's prose needs
 * them. They are registered here rather than imported from Uncial's root, which
 * re-exports the editor.
 *
 * Each component is cast to the registry's general component type — the one the
 * renderer calls, with attributes, content and children. A component that
 * declares none of those accepts no props at all as far as the type system is
 * concerned.
 */
export const blocks = createBlockRegistry([
    defineSvelteBlock({
        id: 'tabs',
        label: 'Tabs',
        description: 'A linked group of labelled content tabs.',
        attributes: {
            group: {
                default: FRAMEWORK_GROUP,
                required: true,
                validate: isFilledString,
                placeholder: FRAMEWORK_GROUP,
            },
        },
        component: Tabs as SvelteBlockComponent,
        content: { kind: 'flow' },
    }),
    defineSvelteBlock({
        id: 'tab',
        label: 'Tab',
        description: 'One labelled panel inside a tabs block.',
        attributes: {
            label: {
                default: '',
                required: true,
                validate: isFilledString,
                placeholder: 'Vue',
            },
        },
        component: Tab as SvelteBlockComponent,
        content: { kind: 'flow' },
    }),
    defineSvelteBlock({
        id: 'callout',
        label: 'Callout',
        description: 'An aside the reader is meant to stop at.',
        attributes: {
            kind: {
                default: 'note',
                input: 'select',
                options: CALLOUT_KINDS.map((kind) => ({
                    value: kind,
                    label: kind[0].toUpperCase() + kind.slice(1),
                })),
                parse: (value: unknown) =>
                    typeof value === 'string' &&
                    (CALLOUT_KINDS as readonly string[]).includes(value)
                        ? value
                        : 'note',
            },
            title: { default: '', placeholder: 'What it is about' },
        },
        component: Callout as SvelteBlockComponent,
        content: { kind: 'flow' },
    }),
    defineSvelteBlock({
        id: 'cssTokens',
        label: 'Public CSS tokens',
        description:
            'Every public CSS custom property, with the themeConfig key that sets it.',
        readOnly: true,
        attributes: {},
        component: CssTokenTable as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'contentStateFixtures',
        label: 'Content State conformance table',
        description:
            'Every IIIF Content State form the viewer resolves, from the committed fixture index.',
        readOnly: true,
        attributes: {
            fixtures: {
                default: [] as readonly ContentStateFixture[],
                validate: (value: unknown) => Array.isArray(value),
            },
        },
        component: ContentStateFixtureTable as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'install',
        label: 'Install block',
        description:
            'Both install forms: the package-manager tabs and the CDN pair.',
        readOnly: true,
        attributes: {},
        component: InstallBlock as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'deployments',
        label: 'Deployments',
        description:
            'Every real deployment of the viewer, as links a reader can open.',
        readOnly: true,
        attributes: {},
        component: DeploymentsList as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'onward',
        label: 'The rest of the site',
        description: 'Every other page the rail carries, as ruled rows.',
        readOnly: true,
        attributes: {},
        component: OnwardList as SvelteBlockComponent,
        content: false,
    }),
]);

export const schema = createSchema(blocks, { metaFields });

/**
 * How long the editor waits after the last keystroke before writing the file.
 *
 * Short enough that the file is never meaningfully behind the screen, long
 * enough that a sentence typed at speed is one write rather than forty. Git is
 * the undo, so there is no save step to reconcile.
 */
export const AUTOSAVE_MS = 400;
