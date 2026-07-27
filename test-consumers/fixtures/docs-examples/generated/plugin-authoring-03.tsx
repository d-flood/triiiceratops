// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createRoot } from 'react-dom/client';
import { useViewerSelector } from '@triiiceratops/plugin-sdk/react';
import type { PluginContext } from 'triiiceratops';

function PluginUI({ context }: { context: PluginContext }) {
    const open = useViewerSelector(context, (s) => s.toolbarOpen);
    return <span>{open ? 'open' : 'closed'}</span>;
}

function mount(container: HTMLElement, context: PluginContext): () => void {
    const root = createRoot(container);
    root.render(<PluginUI context={context} />);
    return () => root.unmount();
}
