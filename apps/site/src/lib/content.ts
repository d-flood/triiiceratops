import { createBlockRegistry, createSchema } from 'uncial/core';
/* Runtime/render subpaths: the root re-exports the editor, which must not reach production. */
import {
    defineSvelteBlock,
    type SvelteBlockComponent,
} from 'uncial/runtime/svelte';
import { Tab, Tabs } from 'uncial/render';
import type { UncialCmsSiteConfig } from 'uncial-cms';

import Callout from './Callout.svelte';
import ContentStateFixtureTable from './ContentStateFixtureTable.svelte';
import CssTokenTable from './CssTokenTable.svelte';
import InstallBlock from './InstallBlock.svelte';
import LinkRow from './LinkRow.svelte';
import LinkRows from './LinkRows.svelte';
import FeatureStage from './FeatureStage.svelte';
import OnwardList from './OnwardList.svelte';

export const siteConfig: UncialCmsSiteConfig = {
    forge: 'local',
    contentDir: 'apps/site/content',
};

export const localContentDir = 'content';

const metaFields = {
    title: { default: '', required: true, placeholder: 'Page title' },
    shortTitle: { default: '', required: true, placeholder: 'Short title' },
    intro: {
        default: '',
        required: true,
        input: 'textarea',
        placeholder: 'One sentence describing the page.',
    },
} as const;

function isFilledString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export const FRAMEWORK_GROUP = 'framework';
export const PLUGIN_UI_GROUP = 'plugin-ui';

export type ContentStateFixture = {
    readonly form: string;
    readonly resolvesVia: string;
    readonly file: string;
    readonly recipe: string | null;
    readonly capturedAt: string;
};

export const CALLOUT_KINDS = [
    'note',
    'tip',
    'important',
    'warning',
    'info',
] as const;

export const blocks = createBlockRegistry([
    defineSvelteBlock({
        id: 'tabs',
        label: 'Tabs',
        description: 'A linked group of labeled content tabs.',
        attributes: {
            group: {
                default: FRAMEWORK_GROUP,
                required: true,
                validate: isFilledString,
                placeholder: FRAMEWORK_GROUP,
            },
        },
        component: Tabs as SvelteBlockComponent,
        content: { kind: 'flow', allowedBlocks: ['tab'] },
    }),
    defineSvelteBlock({
        id: 'tab',
        label: 'Tab',
        description: 'One labeled panel inside a tabs block.',
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
        description: 'A highlighted note, tip or warning.',
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
            title: { default: '', placeholder: 'Title' },
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
        description: 'Package-manager install tabs and the CDN script snippet.',
        readOnly: true,
        attributes: {},
        component: InstallBlock as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'features',
        label: 'Feature stage',
        description: 'Interactive feature list, each shown in a live viewer.',
        readOnly: true,
        attributes: {},
        component: FeatureStage as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'linkRows',
        label: 'Link rows',
        description: 'A ruled list of links, each with a supporting line.',
        attributes: {
            note: {
                default: '',
                input: 'textarea',
                placeholder: 'One line describing this group of links.',
            },
        },
        component: LinkRows as SvelteBlockComponent,
        content: { kind: 'flow', allowedBlocks: ['linkRow'] },
    }),
    defineSvelteBlock({
        id: 'linkRow',
        label: 'Link row',
        description: 'A link with a description and an optional second link.',
        attributes: {
            label: {
                default: '',
                required: true,
                validate: isFilledString,
                placeholder: 'Link text',
            },
            href: {
                default: '',
                required: true,
                validate: isFilledString,
                placeholder: 'https://',
            },
            note: {
                default: '',
                input: 'textarea',
                placeholder: 'Short description',
            },
            actionLabel: { default: '', placeholder: 'Open an example' },
            actionHref: { default: '', placeholder: 'https://' },
        },
        component: LinkRow as SvelteBlockComponent,
        content: false,
    }),
    defineSvelteBlock({
        id: 'onward',
        label: 'Other pages',
        description: 'Links to the other pages in the site navigation.',
        readOnly: true,
        attributes: {},
        component: OnwardList as SvelteBlockComponent,
        content: false,
    }),
]);

export const schema = createSchema(blocks, { metaFields });

export const AUTOSAVE_MS = 400;
