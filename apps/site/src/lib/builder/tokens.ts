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
        note: 'The brand colour and the state colours, each with the text that sits on it.',
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
        title: 'Content colours',
        note: 'Text and icons. Each region follows the global content colour until you set it.',
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
