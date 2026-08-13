/**
 * The test viewer context.
 *
 * `createTestViewerContext` assembles a REAL, compiled `ViewerState` (from
 * `triiiceratops/testing`) with RECORDING DOUBLES for the style, UI, and locale
 * services and an injectable renderer stand-in that defaults to absent. This is the
 * canonical shape of CONTEXT.md's **Test viewer context**: "the harness is fake;
 * the state is never fake." Commands, `subscribe`, selector memoization, and the
 * batched notification flush are all the production implementations — only the
 * host-owned services and the renderer are stand-ins.
 *
 * The doubles only RECORD calls; they need not implement teardown. `runActivation`
 * auto-tracks every `styles.install` and `locale.subscribe` an
 * activation performs and releases them on deactivation, so a recording double is
 * free to be a pure log.
 */

import type {
    IconDescriptor,
    LocaleCatalog,
    PluginContext,
    PluginLocaleService,
    PluginStyleService,
    PluginSurface,
    PluginUiService,
    PluginUiTarget,
    ViewerState,
} from 'triiiceratops';
import {
    createHeadlessLocaleService,
    createHeadlessViewerState,
    createPluginSurface,
    createRendererStub,
    type HeadlessViewerFixtures,
    type RendererStub,
    type RendererStubOptions,
} from 'triiiceratops/testing';

import { whenRendererReady } from '../renderer.js';
import { createSelectorRuntime } from '../selectors.js';

export { whenRendererReady };

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
    /**
     * Chrome id the plugin's surface is bound to — the `config.plugins` key. Use
     * the plugin's own `uiId` when a fixture configures it through
     * `fixtures.config.plugins`; defaults to `'test-plugin'`.
     *
     * It is also the **only** id the viewer knows a plugin by, so it is the only
     * prefix `ViewerState.registerOverlayLayer` accepts: a plugin that ids its
     * layer from `context.surface.id` works here unchanged, and one that hardcodes
     * its package name has its layer refused (`viewererror`,
     * `overlay-layer-refused`) with `mount` never called. Hand `surface` to
     * `activatePlugin` — pass `tc.surface`, as `runActivation` does — or the
     * plugin gets the always-open stub surface, whose id names no plugin of this
     * viewer and whose layers are therefore all refused.
     */
    uiId?: string;
    /**
     * The surface's authored target, mirroring the plugin's
     * `SdkPluginMeta.target`. Defaults to `'panel'`.
     */
    target?: PluginUiTarget;
    /**
     * Whether the plugin's surface starts open. Defaults to `true` so a plugin
     * that gates work on `surface.isOpen` is exercised in its active state
     * without every test having to open it first. Set `false` to test the
     * closed-on-mount path. `fixtures.config.plugins[uiId].open`, if given, wins.
     */
    open?: boolean;
}

/**
 * The assembled test viewer context: a real state, recording-double services, a
 * ready-to-mount {@link PluginContext}, and a renderer injector.
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
     * The REAL plugin surface over the real state (no double): `isOpen` reflects
     * the live viewer, and `open()`/`close()`/`toggle()` drive the actual commands,
     * so a plugin's reaction lands on the real batched flush — `await flush()`
     * before asserting a subscriber ran.
     */
    readonly surface: PluginSurface;
    /**
     * Mount core's headless renderer stand-in and fire the real readiness path
     * (`ViewerState.attachRenderer`). Until it is called `rendererReady` is
     * `false`, the viewport queries answer with zeroes and `null`s, and
     * viewport commands are no-ops.
     *
     * The stand-in comes from core rather than from the caller: the renderer is
     * first-party, so there is one right answer to what a stand-in reports.
     * Returns it, which is also the controller — `setView` moves the viewport,
     * `emitFrame` fires one animation event, `calls` records commands received.
     * Pass `canvasIds` to make it answer `null` for any other canvas, the way a
     * real host does for a canvas it has not laid out.
     *
     * Pair with `whenRendererReady` to await readiness.
     */
    attachRenderer(options?: RendererStubOptions): RendererStub;
    /** Unmount the stand-in {@link attachRenderer} mounted. Idempotent. */
    detachRenderer(): void;
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

    // Real surface over the real state — core's own factory, not a re-implementation.
    // Built before the selector runtime so its UI-state seeding is not counted as
    // a notification a test has to flush past.
    const uiId = options.uiId ?? 'test-plugin';
    const surface = createPluginSurface(
        viewerState,
        uiId,
        options.target ?? 'panel',
    );
    // Default the surface open (see TestViewerContextOptions.open). A fixture
    // config that set `plugins[uiId].open` has already been applied by
    // createPluginSurface's seeding and must win, so only write when the fixture
    // is silent.
    if (options.fixtures?.config?.plugins?.[uiId]?.open === undefined) {
        viewerState.setPluginOpen(uiId, options.open ?? true);
    }

    const selectorRuntime = createSelectorRuntime(viewerState);
    let releaseRenderer: (() => void) | null = null;

    const context: PluginContext = {
        viewerState,
        selectors: selectorRuntime.selectors,
        surface,
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
        surface,
        attachRenderer(options?: RendererStubOptions): RendererStub {
            releaseRenderer?.();
            const stub = createRendererStub(options);
            releaseRenderer = viewerState.attachRenderer(stub);
            return stub;
        },
        detachRenderer(): void {
            releaseRenderer?.();
            releaseRenderer = null;
        },
        dispose(): void {
            releaseRenderer?.();
            releaseRenderer = null;
            selectorRuntime.dispose();
        },
    };
}
