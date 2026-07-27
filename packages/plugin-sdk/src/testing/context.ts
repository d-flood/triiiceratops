/**
 * The test viewer context (ticket 14).
 *
 * `createTestViewerContext` assembles a REAL, compiled `ViewerState` (from
 * `triiiceratops/testing`) with RECORDING DOUBLES for the style, UI, and locale
 * services and an injectable OSD stub that defaults to absent. This is the
 * canonical shape of CONTEXT.md's **Test viewer context**: "the harness is fake;
 * the state is never fake." Commands, `subscribe`, selector memoization, and the
 * batched notification flush are all the production implementations — only the
 * host-owned services and OSD are stand-ins.
 *
 * The doubles only RECORD calls; they need not implement teardown. `runActivation`
 * (ticket 08) auto-tracks every `styles.install` and `locale.subscribe` an
 * activation performs and releases them on deactivation, so a recording double is
 * free to be a pure log.
 */

import type {
    IconDescriptor,
    LocaleCatalog,
    PluginContext,
    PluginLocaleService,
    PluginStyleService,
    PluginUiService,
    ViewerState,
} from 'triiiceratops';
import {
    createHeadlessLocaleService,
    createHeadlessViewerState,
    type HeadlessViewerFixtures,
} from 'triiiceratops/testing';

import { createSelectorRuntime } from '../selectors.js';

/** One recorded `styles.install` call and whether its reference was released. */
export interface RecordedStyleInstall {
    readonly css: string;
    readonly id: string;
    /**
     * `true` once the uninstaller returned by `install` has run. `runActivation`
     * releases every still-held reference on deactivation, so a conforming
     * plugin's installs all end up released.
     */
    released: boolean;
}

/**
 * Recording style service: logs every `install` under {@link installed} and
 * flips `released` when the returned uninstaller runs, so a test can assert
 * install/release symmetry without a real DOM stylesheet.
 */
export interface RecordingStyleService extends PluginStyleService {
    readonly installed: readonly RecordedStyleInstall[];
}

function createRecordingStyleService(): RecordingStyleService {
    const installed: RecordedStyleInstall[] = [];
    return {
        installed,
        install(css: string, id: string): () => void {
            const record: RecordedStyleInstall = { css, id, released: false };
            installed.push(record);
            return () => {
                record.released = true;
            };
        },
    };
}

/** One recorded `ui.renderIcon` request. */
export interface RecordedUiRequest {
    readonly icon: IconDescriptor;
    readonly container: HTMLElement;
}

/**
 * Recording UI service: logs every `renderIcon` under {@link requests} and
 * returns a no-op cleanup (no real `<svg>` is rendered; that belongs to the
 * browser seam).
 */
export interface RecordingUiService extends PluginUiService {
    readonly requests: readonly RecordedUiRequest[];
}

function createRecordingUiService(): RecordingUiService {
    const requests: RecordedUiRequest[] = [];
    return {
        requests,
        renderIcon(icon: IconDescriptor, container: HTMLElement): () => void {
            requests.push({ icon, container });
            return () => {};
        },
    };
}

/**
 * Locale service double that runs the REAL per-viewer active-locale logic
 * (English fallback, `{param}` interpolation — from `createPluginLocaleService`)
 * bound to the headless viewer's `activeLocale`, plus a settable test locale.
 * `setLocale` drives the change through the real observable path
 * (`ViewerState.activeLocale` + the batched notification), so a subscriber only
 * wakes after {@link flush} — real timing, not fake-synchronous.
 */
export interface TestLocaleService extends PluginLocaleService {
    /**
     * Switch the owning viewer's active locale. Delivered on the next flush
     * through the real notification path; logged in {@link switches}.
     */
    setLocale(locale: string): void;
    /** Every locale passed to {@link setLocale}, in order. */
    readonly switches: readonly string[];
}

function createTestLocaleService(
    state: ViewerState,
    catalog?: LocaleCatalog,
): TestLocaleService {
    const real = createHeadlessLocaleService(state, catalog);
    const switches: string[] = [];
    return {
        get current(): string {
            return real.current;
        },
        t(key: string, params?: Record<string, string | number>): string {
            return real.t(key, params);
        },
        subscribe(callback: (locale: string) => void): () => void {
            return real.subscribe(callback);
        },
        switches,
        setLocale(locale: string): void {
            switches.push(locale);
            // Observable member core normally mirrors from config/page locale;
            // the kit stands in for core. The change notifies on the next flush.
            state.activeLocale = locale;
        },
    };
}

/** Options accepted by {@link createTestViewerContext}. */
export interface TestViewerContextOptions {
    /** Pre-load the headless viewer state (locale, config, manifest). */
    fixtures?: HeadlessViewerFixtures;
    /** Catalog the recording locale service's `t` resolves against. */
    catalog?: LocaleCatalog;
}

/**
 * The assembled test viewer context: a real state, recording-double services, a
 * ready-to-mount {@link PluginContext}, and an OSD injector.
 */
export interface TestViewerContext {
    /**
     * A ready `PluginContext` for direct `view.mount(container, context)` tests.
     * Its `selectors` are the real memoized selector runtime over the real state.
     */
    readonly context: PluginContext;
    /** The real, live `ViewerState` (never a fake). */
    readonly viewerState: ViewerState;
    /** Recording style service — see {@link RecordingStyleService.installed}. */
    readonly styles: RecordingStyleService;
    /** Locale double running the real active-locale logic (settable). */
    readonly locale: TestLocaleService;
    /** Recording UI service — see {@link RecordingUiService.requests}. */
    readonly ui: RecordingUiService;
    /**
     * Inject a caller-supplied OSD stub and fire the readiness path
     * (`ViewerState.notifyOSDReady`). `osdViewer` is `null` until called. The kit
     * ships NO OSD fake — OSD-dependent behavior belongs to the browser seam
     * (SPEC.md Testing Decisions). Pair with `whenOsdReady` to await readiness.
     */
    setOsdViewer(stub: unknown): void;
    /**
     * Drop the context's own selector-runtime subscription. Optional: each
     * context owns a fresh state that is garbage-collected with it, so most tests
     * never need this. Provided for suites that assert zero residual subscriptions.
     */
    dispose(): void;
}

/**
 * Build a test viewer context (see {@link TestViewerContext}).
 *
 * The returned `styles`/`locale`/`ui` doubles are ALSO the ones to hand to
 * `activatePlugin`/`runActivation` as the {@link PluginHost} services, so a
 * conformance run and a direct-mount test observe the same recordings.
 */
export function createTestViewerContext(
    options: TestViewerContextOptions = {},
): TestViewerContext {
    const viewerState = createHeadlessViewerState(options.fixtures);
    const styles = createRecordingStyleService();
    const locale = createTestLocaleService(viewerState, options.catalog);
    const ui = createRecordingUiService();
    const selectorRuntime = createSelectorRuntime(viewerState);

    const context: PluginContext = {
        viewerState,
        selectors: selectorRuntime.selectors,
        styles,
        locale,
        ui,
    };

    return {
        context,
        viewerState,
        styles,
        locale,
        ui,
        setOsdViewer(stub: unknown): void {
            viewerState.notifyOSDReady(
                stub as Parameters<ViewerState['notifyOSDReady']>[0],
            );
        },
        dispose(): void {
            selectorRuntime.dispose();
        },
    };
}

/**
 * Resolve once the viewer's OSD readiness path has fired — i.e. `osdViewer` is
 * non-null. Resolves synchronously if OSD is already ready; otherwise it waits
 * on the framework-neutral subscription, so a caller must {@link flush} after
 * `setOsdViewer` for it to settle (real batched timing). This is the SDK's
 * documented "await OSD readiness" helper (SPEC.md ViewerState contract),
 * exposed through the kit.
 */
export function whenOsdReady(
    state: ViewerState,
): Promise<NonNullable<ViewerState['osdViewer']>> {
    const ready = state.osdViewer;
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => {
        const unsubscribe = state.subscribe(() => {
            const viewer = state.osdViewer;
            if (viewer) {
                unsubscribe();
                resolve(viewer);
            }
        });
    });
}
