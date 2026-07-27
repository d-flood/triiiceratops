// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { SelectorController } from '@triiiceratops/plugin-sdk/lit';
import { LitElement, html } from 'lit';
import type { PluginContext } from 'triiiceratops';

export class PluginEl extends LitElement {
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
