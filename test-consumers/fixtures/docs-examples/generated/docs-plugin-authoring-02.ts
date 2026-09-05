// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function mount(container: HTMLElement, context: PluginContext): () => void {
    const label = document.createElement('span');
    const open = context.selectors.select((s) => s.toolbarOpen);
    label.textContent = open.get() ? 'open' : 'closed';
    const stop = open.subscribe((value) => {
        label.textContent = value ? 'open' : 'closed';
    });
    container.appendChild(label);
    return () => {
        stop();
        label.remove();
    };
}
