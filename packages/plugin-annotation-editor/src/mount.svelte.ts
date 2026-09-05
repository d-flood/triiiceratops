/**
 * The framework-neutral mount seam for the annotation editor.
 *
 * `view.mount(container, context)` (in `plugin.ts`) delegates here. This lives in
 * a `.svelte.ts` module because it uses `$effect.root` to drive the display-sync
 * loader (which owns `$effect`s) outside a component, and a plugin-runtime
 * reactive mirror of the owning viewer's state (see `viewerMirror.svelte.ts`).
 *
 * Per activation (per viewer) it:
 *  1. installs the Annotorious stylesheet + chrome through the SDK style service;
 *  2. builds the reactive `ViewerState` mirror + a reactive locale `t`;
 *  3. constructs ONE `AnnotationStore` (per viewer — never shared across viewers,
 *     so annotations can't leak between viewers) and points display sync at the
 *     mirror;
 *  4. runs the loader in an `$effect.root` so the read-only overlay tracks canvas
 *     changes even while the panel is closed;
 *  5. mounts the panel content into the core-provided container, handing the
 *     mirror + `t` down through context.
 *
 * Core owns the chrome: it renders the toolbar button and the docked-panel /
 * anchored-flyout surface, and hands `mount` a content-only `container`, so
 * the content always renders `embedded` (no self-rendered button, header, or
 * positioning).
 *
 * The returned cleanup tears every piece down in reverse.
 */
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
import { createLoader } from './loader.svelte';
import { STYLE_ID, STYLES } from './styles';
import type { AnnotationEditorConfig } from './types';
import { createViewerStateMirror } from './viewerMirror.svelte';

export function mountAnnotationEditor(
    container: HTMLElement,
    context: PluginContext,
    config: AnnotationEditorConfig,
): () => void {
    // Root-aware CSS (Annotorious layer + chrome), single-installed for this
    // activation and released on teardown.
    const releaseStyles = context.styles.install(STYLES, STYLE_ID);
    // Build-extracted Svelte-scoped component CSS (this plugin's + `@triiiceratops/ui`).
    const releaseBundled = context.styles.install(BUNDLED_CSS, 'bundled');

    // Reactive bridges: the mirror makes cross-realm state changes visible to the
    // plugin's own Svelte runtime; the locale bridge makes `t` re-render on an
    // active-locale change.
    const { mirror, destroy: destroyMirror } = createViewerStateMirror(
        context.viewerState,
    );
    const { t, unsubscribe: unsubscribeLocale } = createLocaleBridge(
        context.locale,
    );

    // One store per activation (per viewer). Shared between the loader (display
    // sync while the panel is closed) and the controller/manager (editing).
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

    const app = mount(AnnotationEditorApp, {
        target: container,
        props: {
            config: fullConfig,
            store,
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
        disposeLoader();
        unsubscribeLocale();
        destroyMirror();
        releaseBundled();
        releaseStyles();
    };
}
