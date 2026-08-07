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
/** Markers that fence the generated block inside `docs/theming.md`. */
export declare const THEMING_TABLE_BEGIN = "<!-- BEGIN GENERATED PUBLIC TOKEN TABLE (source: packages/core/src/lib/theme/publicTokens.ts) -->";
export declare const THEMING_TABLE_END = "<!-- END GENERATED PUBLIC TOKEN TABLE -->";
/**
 * Render the complete public token reference as a Markdown fragment, grouped by
 * category, wrapped in the GENERATED markers. Deterministic: token order follows
 * `PUBLIC_TOKENS`, so the output is diff-stable.
 */
export declare function renderThemingTokenTable(): string;
