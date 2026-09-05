// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function surfaceControls(context: PluginContext) {
    const { surface } = context;

    void surface.id; // your chrome id — the `config.plugins` key
    void surface.target; // 'panel' | 'flyout', follows a runtime override

    const done = document.createElement('button');
    done.textContent = 'Done';
    done.onclick = () => surface.close(); // also: open(), toggle()
    return done;
}
