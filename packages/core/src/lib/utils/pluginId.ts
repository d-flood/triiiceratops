export function createPluginId(seed?: string): string {
    const suffix = seed || Math.random().toString(36).substr(2, 9);

    return `plugin-${suffix}`;
}

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
export function sdkPluginChromeId(plugin: {
    uiId?: string;
    name: string;
}): string {
    if (plugin.uiId) return plugin.uiId;

    return plugin.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}
