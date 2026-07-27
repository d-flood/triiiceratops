/**
 * Per-viewer plugin activation (ticket 07).
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
    SdkPluginMeta,
} from 'triiiceratops';

import { negotiateCompatibility } from './compatibility.js';
import { createSelectorRuntime } from './selectors.js';
import {
    createStubLocaleService,
    createStubStyleService,
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

/** An activation handle that does nothing — returned when setup fails. */
const INERT_ACTIVATION: PluginActivation = { deactivate(): void {} };

/**
 * Run one activation of a plugin against a host, isolating every lifecycle
 * phase (ticket 09). Each phase failure is routed to `host.reportError` with its
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
    let selectorRuntime: ReturnType<typeof createSelectorRuntime> | undefined;
    let styles: ReturnType<typeof trackStyles> | undefined;
    let locale: ReturnType<typeof trackLocale> | undefined;
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

        context = {
            viewerState: host.viewerState,
            selectors: selectorRuntime.selectors,
            styles: styles.service,
            locale: locale.service,
            ui: host.ui ?? createStubUiService(),
        };
    } catch (error) {
        selectorRuntime?.dispose();
        styles?.releaseAll();
        locale?.releaseAll();
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
            runtime.dispose();
            throw error;
        }
        report({ phase: 'mount', error });
        // Fall through: return a handle whose cleanups tear down the partial
        // activation on retry (drop subscriptions, release styles).
    }
    cleanups.push(() => styleService.releaseAll());
    cleanups.push(() => localeService.releaseAll());
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
