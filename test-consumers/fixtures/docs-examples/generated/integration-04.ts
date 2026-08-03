// GENERATED from docs/integration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { TriiiceratopsViewerElement } from 'triiiceratops';

// The published element type declares the state bridge (`viewerState`) and
// `searchProvider`. TypeScript hosts widen it locally with the other
// property-tier inputs they assign; those exist on the element at runtime.
type ViewerHost = TriiiceratopsViewerElement & {
    manifestJson?: string | object;
    themeConfig?: string | object;
    config?: string | object;
    initialCanvasRegion?: string | object;
    plugins?: readonly unknown[];
};

const el = document.querySelector<ViewerHost>('triiiceratops-viewer')!;

el.setAttribute('manifest-id', 'https://example.org/manifest.json');
el.config = { toolbar: { side: 'right' } };

el.addEventListener('canvaschange', (event) => {
    const snapshot = (event as CustomEvent).detail;
    console.log('canvas is now', snapshot.canvasId);
});
