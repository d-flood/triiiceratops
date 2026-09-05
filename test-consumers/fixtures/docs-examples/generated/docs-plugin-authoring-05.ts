// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { mount as mountComponent, unmount } from 'svelte';
import PluginUI from './PluginUI.svelte';
import type { PluginContext } from 'triiiceratops';

function mount(container: HTMLElement, context: PluginContext): () => void {
    const app = mountComponent(PluginUI, {
        target: container,
        props: { context },
    });
    return () => unmount(app);
}
