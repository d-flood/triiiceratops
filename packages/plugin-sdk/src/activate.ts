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

    const context: PluginContext = {
        viewerState: host.viewerState,
        selectors: selectorRuntime.selectors,
        styles: host.styles ?? createStubStyleService(),
        locale: host.locale ?? createStubLocaleService(),
        ui: host.ui ?? createStubUiService(),
    };

    // Own cleanup list per activation: the view's returned cleanup, plus the
    // selector runtime disposer (added last so subscriptions drop after the
    // view has torn down).
    const cleanups: Array<() => void> = [];

    const viewCleanup = meta.view.mount(host.container, context);
    if (typeof viewCleanup === 'function') {
        cleanups.push(viewCleanup);
    }
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
