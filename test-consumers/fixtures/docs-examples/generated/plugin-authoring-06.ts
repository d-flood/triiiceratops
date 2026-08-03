// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { SelectorController } from '@triiiceratops/plugin-sdk/lit';
import { LitElement, html } from 'lit';
import type { PluginContext } from 'triiiceratops';

class PluginUI extends LitElement {
    createRenderRoot() {
        return this; // light DOM
    }
    toolbar?: SelectorController<boolean>;

    setContext(context: PluginContext) {
        this.toolbar = new SelectorController(
            this,
            context.selectors.select((s) => s.toolbarOpen),
        );
    }

    render() {
        return html`<span>${this.toolbar?.value ? 'open' : 'closed'}</span>`;
    }
}
customElements.define('plugin-ui', PluginUI);

function mount(container: HTMLElement, context: PluginContext): () => void {
    const el = document.createElement('plugin-ui') as PluginUI;
    el.setContext(context);
    container.appendChild(el);
    return () => el.remove();
}
