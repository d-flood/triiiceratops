// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function surfaceAware(context: PluginContext) {
    const { surface } = context;

    // `isOpen` and `target` are live getters — never snapshot them.
    const open = context.selectors.select(() => surface.isOpen);

    const render = (isOpen: boolean) => {
        if (isOpen) {
            // Start polling, attach an expensive OSD handler, resume an
            // animation — whatever is wasted while nobody can see it.
        } else {
            // Pause it. Keep your state: the plugin is still activated.
        }
    };

    render(open.get()); // may already be open (config.plugins[uiId].open)
    return open.subscribe(render);
}
