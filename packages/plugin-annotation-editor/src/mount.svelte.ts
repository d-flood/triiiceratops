import { mount, unmount } from 'svelte';

import type { PluginContext } from '@triiiceratops/plugin-sdk';

// Build-extracted, Svelte-scoped CSS of every bundled component (this plugin's +
// the `@triiiceratops/ui` primitives), installed through the nonce-aware SDK
// style service so idiomatic `<style>` blocks stay CSP-safe. See vite.config.ts.
import BUNDLED_CSS from 'virtual:tri-bundled-css';

import AnnotationEditorApp from './AnnotationEditorApp.svelte';
import { AnnotationStore } from './AnnotationStore.svelte';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { VIEWER_STATE_KEY } from './contextKey';
import { createLocaleBridge, LOCALE_T_KEY, type TFn } from './i18n.svelte';
import { registerDrawingLayer } from './drawingLayer';
import { DrawingSession } from './drawingSession.svelte';
import { createLoader } from './loader.svelte';
import type { AnnotationEditorConfig } from './types';
import { createViewerStateMirror } from './viewerMirror.svelte';

export function mountAnnotationEditor(
    container: HTMLElement,
    context: PluginContext,
    config: AnnotationEditorConfig,
): () => void {
    // Build-extracted Svelte-scoped component CSS (this plugin's +
    // `@triiiceratops/ui`), single-installed for this activation and released on
    // teardown. Root-aware, so it reaches the shadow root of the element build.
    //
    // The drawing layer needs no sheet of its own: core's overlay-layer wrapper
    // provides the positioned, click-through box, and the container it hands the
    // plugin is `display: contents`, so styling that container would do nothing.
    // The layer's children carry their own styles.
    const releaseBundled = context.styles.install(BUNDLED_CSS, 'bundled');

    // Reactive bridges: the mirror makes cross-realm state changes visible to the
    // plugin's own Svelte runtime; the locale bridge makes `t` re-render on an
    // active-locale change.
    const { mirror, destroy: destroyMirror } = createViewerStateMirror(
        context.viewerState,
        context.surface,
    );
    const { t, unsubscribe: unsubscribeLocale } = createLocaleBridge(
        context.locale,
    );

    // One store per activation (per viewer). Shared between the loader (display
    // sync while the panel is closed) and the controller + drawing layer (editing).
    const adapter = config.adapter ?? new LocalStorageAdapter();
    const fullConfig: AnnotationEditorConfig = { ...config, adapter };
    const store = new AnnotationStore(fullConfig);
    store.setDisplayState(mirror);

    // Drive display sync in its own effect root, so the read-only overlay tracks
    // canvas changes independently of whether the editor panel is open. The
    // loader's own effect cleanup runs `store.destroy()` when this root disposes.
    const disposeLoader = $effect.root(() => {
        createLoader(store)(mirror);
    });

    // The drawing layer belongs to the activation, not to the panel: core keeps
    // the container across a manifest change, and the read-only overlay is
    // visible whether or not the panel is open. The session is what crosses the
    // two component trees — the panel arms a tool, the layer takes the surface.
    const session = new DrawingSession();
    const releaseDrawingLayer = registerDrawingLayer(context, {
        session,
        store,
        viewerState: mirror,
        // The layer is mounted outside the panel's tree, so the locale reaches
        // it as a prop rather than through context.
        t,
    });

    const app = mount(AnnotationEditorApp, {
        target: container,
        props: {
            config: fullConfig,
            store,
            session,
            // Content-only: core provides the button + surface chrome for both
            // panel and flyout targets, so the panel content never renders its
            // own header or floating box.
            embedded: true,
        },
        // One-time context handoff to Svelte's mount(), not reactive state.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        context: new Map<symbol, unknown>([
            [VIEWER_STATE_KEY, mirror],
            [LOCALE_T_KEY, t as TFn],
        ]),
    });

    return () => {
        unmount(app);
        releaseDrawingLayer();
        disposeLoader();
        unsubscribeLocale();
        destroyMirror();
        releaseBundled();
    };
}
