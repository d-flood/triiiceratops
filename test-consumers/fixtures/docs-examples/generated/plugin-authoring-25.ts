// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function installStyles(context: PluginContext) {
    const uninstall = context.styles.install(
        '.my-plugin-panel { padding: 1rem; }',
        'panel',
    );
    return uninstall; // release one reference
}
