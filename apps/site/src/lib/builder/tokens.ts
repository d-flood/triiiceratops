import type { BuiltInTheme } from 'triiiceratops';

import report from '../../../../../api-reports/css-tokens.json';
import type { CssToken } from '../cssTokens';

export type TokenKind = 'colour' | 'length' | 'percent';

export type TokenControl = {
    readonly name: string;
    readonly key: string;
    readonly label: string;
    readonly kind: TokenKind;
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

const KINDS: Record<string, TokenKind> = {
    '--tri-annotation-fill-opacity': 'percent',
    '--tri-annotation-point-size': 'length',
    '--tri-annotation-border-width': 'length',
};

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

export const THEME_CHOICES: readonly {
    readonly value: BuiltInTheme;
    readonly label: string;
}[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'teal', label: 'Teal' },
    { value: 'dracula', label: 'Dracula' },
];
