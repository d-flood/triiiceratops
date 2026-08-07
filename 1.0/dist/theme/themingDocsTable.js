/**
 * Generates the public CSS-token reference table for the theming documentation
 * (`docs/theming.md`) from the single source of truth, {@link PUBLIC_TOKENS}.
 *
 * The theming docs MUST NOT hand-copy the token list: a test
 * (`themingDocsTable.test.ts`) regenerates this table and asserts the block
 * committed to `docs/theming.md` (between the GENERATED markers) is identical.
 * Add or rename a token in `publicTokens.ts`, regenerate, and the docs stay in
 * sync automatically. This is ticket 26's "token table generated from ticket
 * 19's module" contract.
 */
import { CSS_VAR_MAP } from './cssVarMap';
import { PUBLIC_TOKENS } from './publicTokens';
/** Markers that fence the generated block inside `docs/theming.md`. */
export const THEMING_TABLE_BEGIN = '<!-- BEGIN GENERATED PUBLIC TOKEN TABLE (source: packages/core/src/lib/theme/publicTokens.ts) -->';
export const THEMING_TABLE_END = '<!-- END GENERATED PUBLIC TOKEN TABLE -->';
/** Human-readable heading for each token category, in display order. */
const CATEGORY_LABELS = {
    palette: 'Palette',
    surface: 'Surfaces',
    content: 'Content / foreground',
    panel: 'Per-panel overrides',
    radius: 'Border radius',
    sizing: 'Sizing',
    effect: 'Border / effects',
};
const CATEGORY_ORDER = [
    'palette',
    'surface',
    'content',
    'panel',
    'radius',
    'sizing',
    'effect',
];
/** Reverse `CSS_VAR_MAP`: CSS variable name → friendly `themeConfig` key. */
function friendlyNameByVar() {
    const out = new Map();
    for (const [friendly, cssVar] of Object.entries(CSS_VAR_MAP)) {
        out.set(cssVar, friendly);
    }
    return out;
}
/**
 * Render the complete public token reference as a Markdown fragment, grouped by
 * category, wrapped in the GENERATED markers. Deterministic: token order follows
 * `PUBLIC_TOKENS`, so the output is diff-stable.
 */
export function renderThemingTokenTable() {
    const friendly = friendlyNameByVar();
    const lines = [THEMING_TABLE_BEGIN];
    for (const category of CATEGORY_ORDER) {
        const tokens = PUBLIC_TOKENS.filter((t) => t.category === category);
        if (tokens.length === 0)
            continue;
        lines.push('');
        lines.push(`#### ${CATEGORY_LABELS[category]}`);
        lines.push('');
        lines.push('| CSS variable | `themeConfig` key |');
        lines.push('| :----------- | :---------------- |');
        for (const token of tokens) {
            const key = friendly.get(token.name);
            lines.push(`| \`${token.name}\` | ${key ? `\`${key}\`` : '— (raw only)'} |`);
        }
    }
    lines.push('');
    lines.push(THEMING_TABLE_END);
    return lines.join('\n');
}
