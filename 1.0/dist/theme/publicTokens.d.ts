/**
 * Machine-readable registry of the PUBLIC CSS custom properties a theme author
 * may set to customize the viewer. This is the single source of truth for the
 * semver-governed token set and is consumed by:
 *   - the theming documentation (ticket 26),
 *   - the public-CSS-token API snapshot (ticket 21), and
 *   - the distribution test that asserts every listed token ships in the built
 *     stylesheet and that no `--tri-*` variable in the stylesheet is missing
 *     from this list.
 *
 * Every public token lives in the `--tri-*` namespace so it cannot collide with
 * a host application's own design system. Variables NOT in this list are
 * internal implementation details with NO stability guarantee — specifically:
 *   - `--ui-*`                          layout plumbing (chrome/nav/gallery knobs),
 *   - `--panel-surface` / `--panel-fg`  per-panel surface resolution,
 *   - component-local variables         (`--btn-*`, `--tt-*`, `--range-*`, …).
 *
 * Adding or removing an entry here is a public-API change and requires a
 * Changeset. Renames without a new/removed token (as in the 1.0 `--tri-*`
 * migration) are the only exception permitted before stable 1.0.
 */
/** Namespace prefix shared by every public CSS token. */
export declare const PUBLIC_TOKEN_PREFIX = "--tri-";
/** Documentation/snapshot grouping for a public token. */
export type PublicTokenCategory = 'palette' | 'surface' | 'content' | 'panel' | 'radius' | 'sizing' | 'effect';
export interface PublicToken {
    /** CSS custom property name, including the leading `--`. */
    readonly name: string;
    /** Grouping for documentation and API snapshots. */
    readonly category: PublicTokenCategory;
}
/**
 * The complete, ordered set of public CSS tokens. Order is stable so snapshots
 * stay diff-friendly.
 */
export declare const PUBLIC_TOKENS: readonly PublicToken[];
/** Flat list of public token names, in declaration order. */
export declare const PUBLIC_CSS_TOKENS: readonly string[];
/** True when `name` (with or without a leading `--`) is a documented public token. */
export declare function isPublicToken(name: string): boolean;
