/**
 * Per-viewer plugin activation.
 *
 * Activation is explicit and per viewer (CONTEXT.md **Activation**): each call
 * negotiates compatibility, then constructs an isolated context with its own
 * selector runtime (one `ViewerState.subscribe`) and its own cleanup list. On
 * `deactivate()` the mount cleanup runs and the selector subscription is
 * dropped, so no callbacks fire afterward. Deactivation is idempotent.
 */

import type {
    PluginActivation,
    PluginContext,
    PluginHost,
    PluginLocaleService,
    PluginStyleService,
    PublishedState,
    SdkPluginMeta,
    ViewerState,
} from 'triiiceratops';

import { negotiateCompatibility } from './compatibility.js';
import { createSelectorRuntime, type SelectorRuntime } from './selectors.js';
import {
    createStubLocaleService,
    createStubStyleService,
    createStubSurfaceService,
    createStubUiService,
} from './services.js';

/**
 * Wrap a style service so every `install` this activation performs is tracked
 * and any reference still held at deactivation is released automatically
 * (SPEC.md — "style installation deduplicated and cleaned up"). The returned
 * `releaseAll` runs the outstanding uninstallers; each is idempotent, so a
 * plugin that already uninstalled its own sheet is unaffected.
 */
function trackStyles(base: PluginStyleService): {
    service: PluginStyleService;
    releaseAll: () => void;
} {
    const outstanding = new Set<() => void>();
    return {
        service: {
            install(css: string, id: string): () => void {
                const release = base.install(css, id);
                let released = false;
                const wrapped = (): void => {
                    if (released) return;
                    released = true;
                    outstanding.delete(wrapped);
                    release();
                };
                outstanding.add(wrapped);
                return wrapped;
            },
        },
        releaseAll() {
            for (const release of [...outstanding]) release();
            outstanding.clear();
        },
    };
}

/**
 * Wrap a locale service so every `subscribe` this activation registers is
 * tracked and torn down on deactivation, so no active-locale callback fires
 * afterward. `current` and `t` pass straight through.
 */
function trackLocale(base: PluginLocaleService): {
    service: PluginLocaleService;
    releaseAll: () => void;
} {
    const outstanding = new Set<() => void>();
    return {
        service: {
            get current(): string {
                return base.current;
            },
            t(key: string, params?: Record<string, string | number>): string {
                return base.t(key, params);
            },
            subscribe(callback: (locale: string) => void): () => void {
                const unsubscribe = base.subscribe(callback);
                let done = false;
                const wrapped = (): void => {
                    if (done) return;
                    done = true;
                    outstanding.delete(wrapped);
                    unsubscribe();
                };
                outstanding.add(wrapped);
                return wrapped;
            },
        },
        releaseAll() {
            for (const unsubscribe of [...outstanding]) unsubscribe();
            outstanding.clear();
        },
    };
}

/**
 * Track this activation's published state (ADR 0018) so it is retired the moment
 * the activation ends — the mechanism behind "`getPluginState` is null whenever
 * the activation is absent, failed, or retrying". Publishing again supersedes
 * the previous object, since an activation publishes at most one.
 *
 * The publish closure EXPIRES with the activation. `context.publishState` is
 * handed to the plugin, which may still be holding it in an awaited
 * continuation — a media element's `loadedmetadata`, a fetch for cues — that
 * resolves after teardown. Publishing from there would put live state back
 * under the id of an activation that no longer exists, and `getPluginState`
 * would answer non-null for a plugin that is gone.
 */
function trackPublishedState(
    viewerState: ViewerState,
    pluginId: string,
): { publish: (state: PublishedState) => void; releaseAll: () => void } {
    let retire: (() => void) | null = null;
    let ended = false;
    return {
        publish(state: PublishedState): void {
            if (ended) return;
            retire?.();
            retire = viewerState.publishPluginState(pluginId, state);
        },
        releaseAll(): void {
            ended = true;
            retire?.();
            retire = null;
        },
    };
}

/**
 * The one id this viewer knows a plugin by, when the host supplied no surface to
 * ask (direct `runActivation` / test-kit use). Mirrors core's
 * `sdkPluginChromeId`: prefer the declared `uiId`, else collapse the
 * package-qualified name to the DOM-safe form (`@scope/plugin-foo` →
 * `scope-plugin-foo`).
 *
 * Duplicated rather than value-imported for the reason `definePlugin`'s
 * `SDK_PLUGIN_KIND` is: a value import from `triiiceratops` would pull core —
 * and its Svelte runtime — into every plugin bundle. Publishing under the raw
 * name instead would tell authors the wrong `getPluginState` key.
 */
export function sdkChromeId(meta: { uiId?: string; name: string }): string {
    if (meta.uiId) return meta.uiId;

    return meta.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** An activation handle that does nothing — returned when setup fails. */
const INERT_ACTIVATION: PluginActivation = { deactivate(): void {} };

/**
 * Run one activation of a plugin against a host, isolating every lifecycle
 * phase. Each phase failure is routed to `host.reportError` with its
 * phase so the host can present a plugin-local error state and offer retry:
 *
 * - `setup`: compatibility negotiation and context/runtime/service construction.
 * - `mount`: the plugin's `PluginView.mount`.
 * - `command` / `subscription`: selector projection / callback failures, raised
 *   by the selector runtime and the `ViewerState.subscribe` listener guard.
 * - `cleanup`: a teardown cleanup threw; the remaining cleanups still run.
 *
 * When the host supplies NO `reportError` (direct SDK / test-kit use), the
 * historical behavior is preserved: a `setup` failure (e.g.
 * `PluginCompatibilityError`) or a `mount` failure throws, and
 * subscription/command/cleanup failures fall back to a console error.
 */
export function runActivation(
    meta: SdkPluginMeta,
    host: PluginHost,
): PluginActivation {
    const report = host.reportError;

    // ---- setup phase --------------------------------------------------------
    // Negotiate first — no context, subscription, or DOM work happens for an
    // incompatible plugin. Then build the isolated context. Any throw here is
    // the `setup` failure; partial state is released before reporting.
    let selectorRuntime: SelectorRuntime | undefined;
    let styles: ReturnType<typeof trackStyles> | undefined;
    let locale: ReturnType<typeof trackLocale> | undefined;
    let published: ReturnType<typeof trackPublishedState> | undefined;
    let context: PluginContext;
    try {
        negotiateCompatibility(meta, host);

        // Own selector runtime (own single ViewerState.subscribe) per
        // activation, wired so selector projection/callback failures are
        // attributed to this plugin.
        selectorRuntime = createSelectorRuntime(host.viewerState, {
            onProjectionError: report
                ? (error) => report({ phase: 'command', error })
                : undefined,
            onListenerError: report
                ? (error) => report({ phase: 'subscription', error })
                : undefined,
        });

        // Wrap the host-supplied style and locale services so this activation's
        // style installs and locale subscriptions are released automatically on
        // teardown, even if the plugin's own cleanup forgot them.
        styles = trackStyles(host.styles ?? createStubStyleService());
        locale = trackLocale(host.locale ?? createStubLocaleService());

        // The plugin's own panel/flyout: how it observes whether the user can
        // currently see it. Core supplies the real surface (it owns the chrome
        // id); a chrome-less host gets the always-open stub. Its `id` is also the
        // one id this viewer knows the plugin by, so it is what a publication is
        // keyed to, exactly as an overlay layer's id is.
        const surface =
            host.surface ?? createStubSurfaceService(sdkChromeId(meta));
        published = trackPublishedState(host.viewerState, surface.id);
        const publishState = published.publish;

        context = {
            viewerState: host.viewerState,
            selectors: selectorRuntime.selectors,
            surface,
            styles: styles.service,
            locale: locale.service,
            ui: host.ui ?? createStubUiService(),
            publishState,
        };
    } catch (error) {
        selectorRuntime?.dispose();
        styles?.releaseAll();
        locale?.releaseAll();
        published?.releaseAll();
        if (report) {
            report({ phase: 'setup', error });
            return INERT_ACTIVATION;
        }
        throw error;
    }

    // Own cleanup list per activation: the view's returned cleanup, then the
    // service releases and the selector runtime disposer (added last so
    // subscriptions and sheets drop after the view has torn down). Built before
    // mount so a failed mount still has its partial cleanups for retry teardown.
    const cleanups: Array<() => void> = [];
    const styleService = styles;
    const localeService = locale;
    const publishedState = published;
    const runtime = selectorRuntime;

    // ---- mount phase --------------------------------------------------------
    try {
        const viewCleanup = meta.view.mount(host.container, context);
        if (typeof viewCleanup === 'function') {
            cleanups.push(viewCleanup);
        }
    } catch (error) {
        if (!report) {
            // No host channel: release the partial activation and rethrow.
            styleService.releaseAll();
            localeService.releaseAll();
            publishedState.releaseAll();
            runtime.dispose();
            throw error;
        }
        report({ phase: 'mount', error });
        // Retire the publication NOW rather than at teardown: a plugin that
        // published and then threw is a FAILED activation, and published state
        // is absent for a failed activation (ADR 0018). Everything else can
        // wait for the handle's cleanups, because nothing else is reachable
        // from a host.
        publishedState.releaseAll();
        // Fall through: return a handle whose cleanups tear down the partial
        // activation on retry (drop subscriptions, release styles).
    }
    cleanups.push(() => styleService.releaseAll());
    cleanups.push(() => localeService.releaseAll());
    cleanups.push(() => publishedState.releaseAll());
    cleanups.push(() => runtime.dispose());

    let deactivated = false;
    return {
        deactivate(): void {
            if (deactivated) return;
            deactivated = true;
            // Run in reverse (LIFO). A throwing cleanup is isolated so the rest
            // still run, and is reported as the `cleanup` phase.
            for (let i = cleanups.length - 1; i >= 0; i--) {
                try {
                    cleanups[i]?.();
                } catch (error) {
                    if (report) {
                        report({ phase: 'cleanup', error });
                    } else {
                        // triiiceratops-console-allow: report-channel-first
                        // fallback. Only reached in direct SDK / test-kit use
                        // with no host `reportError`. Recorded in lint-allowlist.md.
                        console.error(
                            `[triiiceratops] Plugin "${meta.name}" cleanup threw during deactivation; teardown continues.`,
                            error,
                        );
                    }
                }
            }
            cleanups.length = 0;
        },
    };
}

/**
 * Activate an already-defined plugin against a host. Equivalent to calling the
 * plugin's own `activate(host)`; exported for direct/test-kit use.
 */
export function activatePlugin(
    plugin: SdkPluginMeta & {
        activate?: (host: PluginHost) => PluginActivation;
    },
    host: PluginHost,
): PluginActivation {
    if (typeof plugin.activate === 'function') {
        return plugin.activate(host);
    }
    return runActivation(plugin, host);
}
