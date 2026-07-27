// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useViewerSelector } from '@triiiceratops/plugin-sdk/vue';
import type { PluginContext } from 'triiiceratops';

export function useToolbarOpen(context: PluginContext) {
    const open = useViewerSelector(context, (s) => s.toolbarOpen);
    return open; // Ref<boolean>; read open.value in a template
}
