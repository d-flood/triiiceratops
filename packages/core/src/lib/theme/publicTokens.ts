/**
 * Machine-readable registry of the PUBLIC CSS custom properties a theme author
 * may set to customize the viewer. This is the single source of truth for the
 * semver-governed token set and is consumed by:
 *   - the theming documentation,
 *   - the public-CSS-token API snapshot, and
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
export const PUBLIC_TOKEN_PREFIX = '--tri-';

/** Documentation/snapshot grouping for a public token. */
export type PublicTokenCategory =
    | 'palette'
    | 'surface'
    | 'content'
    | 'panel'
    | 'radius'
    | 'sizing'
    | 'effect';

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
export const PUBLIC_TOKENS: readonly PublicToken[] = [
    // ---- Palette ----
    { name: '--tri-color-primary', category: 'palette' },
    { name: '--tri-color-primary-content', category: 'palette' },
    { name: '--tri-color-primary-text', category: 'palette' },
    { name: '--tri-color-neutral', category: 'palette' },
    { name: '--tri-color-neutral-content', category: 'palette' },
    { name: '--tri-color-success', category: 'palette' },
    { name: '--tri-color-success-content', category: 'palette' },
    { name: '--tri-color-warning', category: 'palette' },
    { name: '--tri-color-warning-content', category: 'palette' },
    { name: '--tri-color-error', category: 'palette' },
    { name: '--tri-color-error-content', category: 'palette' },

    // ---- Surfaces ----
    { name: '--tri-viewer-bg', category: 'surface' },
    { name: '--tri-toolbar-bg', category: 'surface' },
    { name: '--tri-panel-bg', category: 'surface' },
    { name: '--tri-gallery-bg', category: 'surface' },
    { name: '--tri-input-bg', category: 'surface' },
    { name: '--tri-surface-border', category: 'surface' },

    // ---- Content / foreground ----
    { name: '--tri-content', category: 'content' },
    { name: '--tri-panel-content', category: 'content' },
    { name: '--tri-toolbar-content', category: 'content' },
    { name: '--tri-viewer-content', category: 'content' },
    { name: '--tri-gallery-content', category: 'content' },

    // ---- Per-panel overrides (built-in panels) ----
    { name: '--tri-metadata-panel-bg', category: 'panel' },
    { name: '--tri-metadata-panel-content', category: 'panel' },
    { name: '--tri-annotations-panel-bg', category: 'panel' },
    { name: '--tri-annotations-panel-content', category: 'panel' },
    { name: '--tri-search-panel-bg', category: 'panel' },
    { name: '--tri-search-panel-content', category: 'panel' },
    { name: '--tri-structures-panel-bg', category: 'panel' },
    { name: '--tri-structures-panel-content', category: 'panel' },
    { name: '--tri-collection-panel-bg', category: 'panel' },
    { name: '--tri-collection-panel-content', category: 'panel' },

    // ---- Border radius ----
    { name: '--tri-radius-selector', category: 'radius' },
    { name: '--tri-radius-buttons', category: 'radius' },
    { name: '--tri-radius-box', category: 'radius' },
    { name: '--tri-radius-toolbar', category: 'radius' },
    { name: '--tri-radius-panels', category: 'radius' },
    { name: '--tri-radius-controls', category: 'radius' },
    { name: '--tri-radius-controls-buttons', category: 'radius' },

    // ---- Sizing ----
    { name: '--tri-size-selector', category: 'sizing' },
    { name: '--tri-size-field', category: 'sizing' },

    // ---- Border / effects ----
    { name: '--tri-border', category: 'effect' },
    { name: '--tri-depth', category: 'effect' },
] as const;

/** Flat list of public token names, in declaration order. */
export const PUBLIC_CSS_TOKENS: readonly string[] = PUBLIC_TOKENS.map(
    (t) => t.name,
);

/** True when `name` (with or without a leading `--`) is a documented public token. */
export function isPublicToken(name: string): boolean {
    const normalized = name.startsWith('--') ? name : `--${name}`;
    return PUBLIC_CSS_TOKENS.includes(normalized);
}
