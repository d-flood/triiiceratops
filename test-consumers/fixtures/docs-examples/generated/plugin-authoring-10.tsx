// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { useViewerSelector } from '@triiiceratops/plugin-sdk/react';
import type { PluginContext } from 'triiiceratops';

export function PluginUI({ context }: { context: PluginContext }) {
    const open = useViewerSelector(context, (s) => s.toolbarOpen);
    return <span>{open ? 'open' : 'closed'}</span>;
}
