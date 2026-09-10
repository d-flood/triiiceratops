/**
 * The builder's theming controls, derived from the committed token report.
 *
 * The report is the machine-readable form of the viewer's own token registry
 * and of the map that gives each token its `themeConfig` key, so the builder
 * offers exactly the tokens the theming reference documents and cannot invent
 * one. A token the registry drops disappears from this page on the next build.
 *
 * Only tokens with a `themeConfig` key are offered: a derived token like
 * `--tri-color-primary-text` has no key to emit, and setting it would need raw
 * CSS rather than a configuration a reader can send to a developer.
 *
 * Sizing and border/effect tokens are deliberately absent. This route's surface
 * is the palette, the surfaces and content colours, the per-panel overrides and
 * the corners; the theming reference is where the rest is set.
 */

import type { BuiltInTheme } from 'triiiceratops';

import report from '../../../../../api-reports/css-tokens.json';
import type { CssToken } from '../cssTokens';

export type TokenControl = {
    /** The CSS custom property, named so a theme author recognises it. */
    readonly name: string;
    /** The `themeConfig` key that sets it. */
    readonly key: string;
    readonly label: string;
};

export type TokenGroup = {
    readonly title: string;
    readonly note: string;
    /** Colours take a swatch; lengths take a slider in pixels. */
    readonly kind: 'colour' | 'length';
    readonly tokens: readonly TokenControl[];
};

/**
 * A token's own name, read as English. Derived rather than transcribed, so a
 * new token arrives labelled instead of unlabelled: `--tri-metadata-panel-bg`
 * reads "Metadata panel background", and the category's own prefix is dropped
 * because the group heading has already said it.
 */
function label(name: string, drop: readonly string[]): string {
    const words = name
        .slice(report.prefix.length)
        .split('-')
        .filter((word, at) => !(at === 0 && drop.includes(word)))
        .map((word) => (word === 'bg' ? 'background' : word));
    return words.join(' ').replace(/^./, (first) => first.toUpperCase());
}

const CATEGORIES: readonly {
    readonly id: string;
    readonly title: string;
    readonly note: string;
    readonly kind: TokenGroup['kind'];
    readonly drop: readonly string[];
}[] = [
    {
        id: 'palette',
        title: 'Palette',
        note: 'The brand color and the state colors, each with the text that sits on it.',
        kind: 'colour',
        drop: ['color'],
    },
    {
        id: 'surface',
        title: 'Surfaces',
        note: 'What each region of the viewer is painted on. The gallery and the input surface follow the viewer’s until you say otherwise.',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'content',
        title: 'Content colors',
        note: 'Text and icons. Each region follows the global content color until you set it.',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'panel',
        title: 'Per-panel overrides',
        note: 'One panel retinted on its own, rather than every panel at once.',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'radius',
        title: 'Corners',
        note: 'The three top-level radii and the regions that can depart from them.',
        kind: 'length',
        drop: ['radius'],
    },
];

const TOKENS = report.tokens as readonly CssToken[];

export const TOKEN_GROUPS: readonly TokenGroup[] = CATEGORIES.map(
    (category) => ({
        title: category.title,
        note: category.note,
        kind: category.kind,
        tokens: TOKENS.filter(
            (token) =>
                token.category === category.id && token.themeConfigKey !== null,
        ).map((token) => ({
            name: token.name,
            key: token.themeConfigKey as string,
            label: label(token.name, category.drop),
        })),
    }),
);

/**
 * The themes a reader can start from, and the label each carries.
 *
 * Written out rather than derived: the token report is a report of tokens and
 * says nothing about which themes declare them, and importing the viewer's own
 * `BUILTIN_THEMES` here would pull the package into this route's first chunk —
 * which is the one thing a page arguing the viewer is light may not do.
 * `tests/unit/builder-surface.test.ts` holds the list to that export instead,
 * so a theme the package adds or drops fails the suite rather than going
 * quietly missing from this control.
 *
 * A theme is the ground the token controls read through, not a fifth kind of
 * token: it reaches the viewer as its own input, so it is offered beside them
 * rather than among them.
 */
export const THEME_CHOICES: readonly {
    readonly value: BuiltInTheme;
    readonly label: string;
}[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'teal', label: 'Teal' },
    { value: 'dracula', label: 'Dracula' },
];
