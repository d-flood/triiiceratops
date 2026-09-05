/**
 * The viewer's public CSS custom properties, grouped as the theming
 * documentation shows them.
 *
 * The rows come from the committed token report, which `scripts/api-report.ts`
 * generates from the viewer's own token registry and the map that gives each
 * token its `themeConfig` key. The documentation therefore derives the table
 * rather than transcribing it: adding, renaming or removing a token changes
 * this page on the next build, and there is no second copy to gate.
 *
 * The report is read rather than the registry itself: an application may see a
 * package only through its published entrypoints, and the token registry is
 * package source. The report is the machine-readable form the repository
 * already publishes of it.
 */
import report from '../../../../api-reports/css-tokens.json';

export type CssToken = {
    readonly name: string;
    readonly category: string;
    /** The `themeConfig` key that sets it, or `null` where only raw CSS will. */
    readonly themeConfigKey: string | null;
};

export type CssTokenGroup = {
    readonly label: string;
    readonly slug: string;
    readonly tokens: readonly CssToken[];
};

/**
 * The categories in display order, with the heading each one carries.
 *
 * Declared rather than derived from the report: the order is an editorial
 * argument about what a theme author reaches for first, and a new category
 * appearing in the middle of the page because a token was added is exactly the
 * kind of silent change the declared lists elsewhere in this application exist
 * to prevent.
 */
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
