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

/** Colours take a swatch; lengths a slider in pixels, percentages one in per cent. */
export type TokenKind = 'colour' | 'length' | 'percent';

export type TokenControl = {
    /** The CSS custom property, named so a theme author recognises it. */
    readonly name: string;
    /** The `themeConfig` key that sets it. */
    readonly key: string;
    readonly label: string;
    readonly kind: TokenKind;
    /** Where this token's slider runs, where the general range does not suit. */
    readonly range?: SliderRange;
};

export type SliderRange = {
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
};

export type TokenGroup = {
    readonly title: string;
    readonly note: string;
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
    readonly kind: TokenKind;
    readonly drop: readonly string[];
}[] = [
    {
        id: 'palette',
        title: 'Palette',
        note: 'The brand/state colors and their text colors.',
        kind: 'colour',
        drop: ['color'],
    },
    {
        id: 'surface',
        title: 'Surfaces',
        note: 'The gallery and the input surface follow the viewer’s by default.',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'content',
        title: 'Content colors',
        note: 'Text and icons. Each region follows the global content color by default.',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'panel',
        title: 'Per-panel overrides',
        note: '',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'annotation',
        title: 'Annotations',
        note: '',
        kind: 'colour',
        drop: [],
    },
    {
        id: 'radius',
        title: 'Corners',
        note: 'Set which corners are rounded and how much.',
        kind: 'length',
        drop: ['radius'],
    },
];

const TOKENS = report.tokens as readonly CssToken[];

/**
 * The kinds a category cannot answer for.
 *
 * Every other group is one kind throughout — a palette is colours, the corners
 * are lengths — and annotations are the exception: the same group decides two
 * hues, the size of a marker, the width of a border and how much of the hue
 * fills a shape. Named here rather than derived from the token's own name, so a
 * control's kind is a decision on the page rather than a spelling convention
 * the next token has to remember to follow.
 */
const KINDS: Record<string, TokenKind> = {
    '--tri-annotation-fill-opacity': 'percent',
    '--tri-annotation-point-size': 'length',
    '--tri-annotation-border-width': 'length',
};

/**
 * Where a slider runs, for the tokens the general 0–32px range does not suit.
 *
 * A corner takes that range and reads as a corner at every point of it, zero
 * included: a square corner is an answer. A shape's border is not the same
 * control. Past ten pixels it stops being an edge around the material and
 * becomes a band over it, and at zero it stops being a border at all — the
 * shape loses the outline that separates it from the image under it, which is
 * not something to hand a reader by dragging one notch too far. So it runs from
 * a hairline to ten, in half pixels, which are what a border can honestly be
 * drawn in on the screens that can draw one.
 */
const RANGES: Record<string, SliderRange> = {
    '--tri-annotation-border-width': { min: 0.5, max: 10, step: 0.5 },
};

export const TOKEN_GROUPS: readonly TokenGroup[] = CATEGORIES.map(
    (category) => ({
        title: category.title,
        note: category.note,
        tokens: TOKENS.filter(
            (token) =>
                token.category === category.id && token.themeConfigKey !== null,
        ).map((token) => ({
            name: token.name,
            key: token.themeConfigKey as string,
            label: label(token.name, category.drop),
            kind: KINDS[token.name] ?? category.kind,
            range: RANGES[token.name],
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
