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

/**
 * Run one activation of a plugin against a host. Throws
 * `PluginCompatibilityError` before any side effects if the plugin is
 * incompatible; otherwise mounts the view and returns the activation handle.
 */
export function runActivation(
    meta: SdkPluginMeta,
    host: PluginHost,
): PluginActivation {
    // Negotiate first — no context, subscription, or DOM work happens for an
    // incompatible plugin.
    negotiateCompatibility(meta, host);

    // Own selector runtime (own single ViewerState.subscribe) per activation.
    const selectorRuntime = createSelectorRuntime(host.viewerState);

    // Wrap the host-supplied style and locale services so this activation's
    // style installs and locale subscriptions are released automatically on
    // teardown, even if the plugin's own cleanup forgot them.
    const styles = trackStyles(host.styles ?? createStubStyleService());
    const locale = trackLocale(host.locale ?? createStubLocaleService());

    const context: PluginContext = {
        viewerState: host.viewerState,
        selectors: selectorRuntime.selectors,
        styles: styles.service,
        locale: locale.service,
        ui: host.ui ?? createStubUiService(),
    };

    // Own cleanup list per activation: the view's returned cleanup, then the
    // service releases and the selector runtime disposer (added last so
    // subscriptions and sheets drop after the view has torn down).
    const cleanups: Array<() => void> = [];

    const viewCleanup = meta.view.mount(host.container, context);
    if (typeof viewCleanup === 'function') {
        cleanups.push(viewCleanup);
    }
    cleanups.push(() => styles.releaseAll());
    cleanups.push(() => locale.releaseAll());
    cleanups.push(() => selectorRuntime.dispose());

    let deactivated = false;
    return {
        deactivate(): void {
            if (deactivated) return;
            deactivated = true;
            // Run in reverse (LIFO). A throwing cleanup is isolated so the rest
            // still run; ticket 09 formalizes attribution/reporting.
            for (let i = cleanups.length - 1; i >= 0; i--) {
                try {
                    cleanups[i]?.();
                } catch (error) {
                    console.error(
                        `[triiiceratops] Plugin "${meta.name}" cleanup threw during deactivation; teardown continues.`,
                        error,
                    );
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
    plugin: SdkPluginMeta & { activate?: (host: PluginHost) => PluginActivation },
    host: PluginHost,
): PluginActivation {
    if (typeof plugin.activate === 'function') {
        return plugin.activate(host);
    }
    return runActivation(plugin, host);
}
