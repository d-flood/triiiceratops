// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function mount(container: HTMLElement, context: PluginContext): () => void {
    const label = document.createElement('span');
    label.textContent = 'hello from a plugin';
    container.appendChild(label);

    // Return cleanup — run on deactivation / retry / viewer teardown.
    return () => {
        label.remove();
    };
}
