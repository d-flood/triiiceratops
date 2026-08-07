export declare function createPluginId(seed?: string): string;
/**
 * Stable, DOM-safe UI id for an SDK plugin — the key consumers use under
 * `ViewerConfig.plugins` and the prefix for the plugin's toolbar button, panel,
 * and flyout (which seed a DOM id and CSS `anchor-name`, so the id must match
 * `[A-Za-z0-9_-]+`). Prefers the plugin's declared `uiId`; otherwise derives one
 * from the package-qualified name by collapsing every run of unsafe characters
 * to a single `-` and trimming leading/trailing `-` (`@scope/plugin-foo` →
 * `scope-plugin-foo`). Deterministic — never random — so the key is predictable
 * and stable across re-activation.
 */
export declare function sdkPluginChromeId(plugin: {
    uiId?: string;
    name: string;
}): string;
