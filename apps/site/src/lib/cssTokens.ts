import report from '../../../../api-reports/css-tokens.json';

export type CssToken = {
    readonly name: string;
    readonly category: string;
    readonly themeConfigKey: string | null;
};

export type CssTokenGroup = {
    readonly label: string;
    readonly slug: string;
    readonly tokens: readonly CssToken[];
};

const CATEGORIES: readonly { readonly id: string; readonly label: string }[] = [
    { id: 'palette', label: 'Palette' },
    { id: 'surface', label: 'Surfaces' },
    { id: 'content', label: 'Content / foreground' },
    { id: 'panel', label: 'Per-panel overrides' },
    { id: 'radius', label: 'Border radius' },
    { id: 'sizing', label: 'Sizing' },
    { id: 'effect', label: 'Border / effects' },
];

const TOKENS = report.tokens as readonly CssToken[];

export const CSS_TOKEN_GROUPS: readonly CssTokenGroup[] = CATEGORIES.map(
    (category) => ({
        label: category.label,
        slug: `public-tokens-${category.id}`,
        tokens: TOKENS.filter((token) => token.category === category.id),
    }),
).filter((group) => group.tokens.length > 0);

export const CSS_TOKEN_PREFIX = report.prefix;
