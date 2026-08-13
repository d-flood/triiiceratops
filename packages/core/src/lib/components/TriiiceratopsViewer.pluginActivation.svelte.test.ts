/**
 * SDK plugin activation: what core leaves behind when a mount FAILS, and what a
 * retry finds.
 *
 * Core fails closed (ADR 0010): a plugin whose setup or mount throws renders no
 * toolbar button. That path also has to leave viewer state as it found it, and it
 * is the only path in the activation lifecycle that can be reached with the
 * plugin's own registrations already in place — because a plugin registers its
 * overlay layers and its surface seeds its UI state DURING the mount that then
 * throws.
 *
 * Two things depended on that, and neither had a test:
 *
 * - An overlay layer registered by a mount that then threw is DOM on the image
 *   belonging to a plugin the viewer decided not to render. Nothing else will ever
 *   remove it.
 * - `registerOverlayLayer` validates a layer id's prefix against plugin UI state,
 *   so a failed activation whose UI state survives keeps a plugin that does not
 *   exist looking like a known one — and a retry re-registering the same layer id
 *   hits the duplicate-id refusal and renders nothing, forever.
 *
 * The plugin here is a hand-built `SdkPlugin` rather than one from the SDK: core
 * activates plugins through the structural `activate(host)` seam alone, and going
 * through the SDK would put its own guards between the test and the seam under
 * test.
 */

import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import type { ViewerState } from '../state/viewer.svelte';
import {
    SDK_PLUGIN_KIND,
    type IconDescriptor,
    type PluginError,
    type PluginHost,
    type SdkPlugin,
} from '../types/plugin';
import type { ViewerError } from '../types/viewerError';

const ICON: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
};

const UI_ID = 'notes';

/**
 * A plugin whose activation runs `attempt` and reports a mount failure if it
 * throws — the shape the SDK's guarded mount presents to core.
 *
 * `attempt` receives the host, so it can do exactly what a real plugin does from
 * inside `view.mount`: register an overlay layer under the id its surface tells it
 * the viewer knows it by.
 */
function testPlugin(attempt: (host: PluginHost) => void): SdkPlugin {
    return {
        kind: SDK_PLUGIN_KIND,
        name: '@example/plugin-notes',
        uiId: UI_ID,
        version: '1.0.0',
        coreRange: '*',
        pluginApiRange: '*',
        requiredCapabilities: [],
        icon: ICON,
        // `flyout`, not the default `panel`: the seeded target is then observable
        // through `getPluginTarget`, which is how a test sees whether the plugin's
        // UI state survived.
        target: 'flyout',
        view: { mount: () => () => {} },
        activate(host: PluginHost) {
            try {
                attempt(host);
            } catch (error) {
                host.reportError?.({ phase: 'mount', error });
            }
            return { deactivate: () => {} };
        },
    };
}

describe('TriiiceratopsViewer — a failed SDK plugin activation', () => {
    let app: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (app) {
            await unmount(app);
            app = null;
        }
        document.body.innerHTML = '';
    });

    async function mountViewer(plugins: SdkPlugin[]) {
        const errors: PluginError[] = [];
        const viewerErrors: ViewerError[] = [];
        const props = $state({
            plugins,
            viewerState: undefined as unknown as ViewerState,
            onpluginerror: (error: PluginError) => errors.push(error),
            onviewererror: (error: ViewerError) => viewerErrors.push(error),
        });
        app = mount(TriiiceratopsViewer, { target: document.body, props });
        await tick();
        return {
            state: props.viewerState as ViewerState,
            errors,
            viewerErrors,
        };
    }

    /**
     * One activation's attempt to register its layer, logged so a test can tell
     * WHICH activation's layer the registry ended up holding.
     *
     * The mount thunk is fresh per attempt and is the log's identity: two
     * activations register the same id, so the id alone cannot distinguish the
     * retry's layer from a stale one the failed activation left behind.
     */
    interface Attempt {
        id: string;
        mount: () => () => void;
    }

    function registerLayer(attempts: Attempt[], host: PluginHost): void {
        const attempt: Attempt = {
            id: `${host.surface!.id}:markers`,
            mount: () => () => {},
        };
        attempts.push(attempt);
        host.viewerState.registerOverlayLayer(attempt);
    }

    /** Register a layer the way a real plugin does, then fail the mount. */
    function registerThenThrow(attempts: Attempt[]) {
        return (host: PluginHost) => {
            registerLayer(attempts, host);
            throw new Error('mount blew up after registering its layer');
        };
    }

    it('renders no chrome, and leaves neither the plugin’s layers nor its UI state behind', async () => {
        const { state, errors } = await mountViewer([
            testPlugin(registerThenThrow([])),
        ]);

        // Fail closed, as before: the failure is reported and no button appears.
        expect(errors.map((error) => error.phase)).toEqual(['mount']);
        expect(state.pluginMenuButtons).toEqual([]);

        // The layer the failed mount registered is gone. Nothing else would ever
        // have removed it: the plugin holds the only dispose, and it threw.
        expect(state.overlayLayers).toEqual([]);

        // And the UI state its surface seeded is gone with it — `flyout` was the
        // authored target, so falling back to `panel` is the seeded entry's
        // absence. This is what `registerOverlayLayer` validates ids against, so a
        // surviving entry would keep vouching for a plugin that does not exist.
        expect(state.getPluginTarget(UI_ID)).toBe('panel');
    });

    it('lets a retry re-register the same layer id, so the retried plugin renders', async () => {
        const attempts: Attempt[] = [];
        let shouldFail = true;
        const plugin = testPlugin((host) => {
            if (shouldFail) registerThenThrow(attempts)(host);
            else registerLayer(attempts, host);
        });

        const { state, errors } = await mountViewer([plugin]);
        expect(errors).toHaveLength(1);

        // The host's error affordance: full re-activation, the only retry there is.
        shouldFail = false;
        const refusals: string[] = [];
        state.setErrorReporter((error) => refusals.push(error.code));
        errors[0].retry();
        await tick();

        // Both attempts registered the SAME id, and the RETRY's registration is the
        // one the registry holds. If the failed activation's record had survived,
        // the retry would have been refused as a duplicate and the registry would
        // still be holding the dead activation's layer — same id, wrong thunk, and
        // a plugin rendering nothing for the rest of the session.
        expect(attempts.map((attempt) => attempt.id)).toEqual([
            `${UI_ID}:markers`,
            `${UI_ID}:markers`,
        ]);
        expect(refusals).toEqual([]);
        expect(state.overlayLayers).toHaveLength(1);
        expect(state.overlayLayers[0].mount).toBe(attempts[1].mount);
        // And the retried plugin got its chrome, so it is really live.
        expect(state.pluginMenuButtons.map((button) => button.id)).toEqual([
            `${UI_ID}:toggle`,
        ]);
    });

    // ADR 0018: published state is absent whenever its activation is absent,
    // failed, or RETRYING. Retry is a full re-activation, so the publication has
    // to be gone by the time the retried mount runs — otherwise the second
    // publish lands on an id the dead activation still holds and is refused,
    // and the host reaches a plugin that no longer exists for the rest of the
    // session. Nothing else pins that: it holds today only because
    // `retrySdkPlugin` happens to tear down and re-activate synchronously.
    it('leaves no published state behind when a failed plugin is retried', async () => {
        const publications: unknown[] = [];
        const publish = (host: PluginHost): void => {
            const published = { subscribe: () => () => {} };
            publications.push(published);
            host.viewerState.publishPluginState(host.surface!.id, published);
        };

        let shouldFail = true;
        const { state, errors, viewerErrors } = await mountViewer([
            testPlugin((host) => {
                publish(host);
                if (shouldFail)
                    throw new Error('mount blew up after publishing');
            }),
        ]);

        expect(errors.map((error) => error.phase)).toEqual(['mount']);
        expect(
            state.getPluginState(UI_ID),
            'a failed activation publishes nothing a host can reach',
        ).toBeNull();

        // Retry into a SECOND failure: still nothing published, and the second
        // publication was not refused as a duplicate of the first.
        errors[0].retry();
        await tick();
        expect(publications).toHaveLength(2);
        expect(state.getPluginState(UI_ID)).toBeNull();

        // And a retry that succeeds publishes freshly under the same id.
        shouldFail = false;
        errors[1].retry();
        await tick();
        expect(publications).toHaveLength(3);
        expect(state.getPluginState(UI_ID)).toBe(publications[2]);
        expect(viewerErrors, 'no publication was ever refused').toEqual([]);
    });

    it('delivers a refused layer id to the host’s onviewererror, not only to the debug log', async () => {
        // The author error a default viewer would otherwise swallow entirely:
        // `logger.warn` is a no-op unless `ViewerConfig.debug` is on. Asserted
        // through the viewer's own `onviewererror` prop rather than a reporter the
        // test installs, so the wiring is part of the claim.
        const { state, viewerErrors } = await mountViewer([]);

        const dispose = state.registerOverlayLayer({
            id: 'ghost:markers',
            mount: () => () => {},
        });

        expect(state.overlayLayers).toEqual([]);
        expect(viewerErrors).toHaveLength(1);
        expect(viewerErrors[0].severity).toBe('warning');
        expect(viewerErrors[0].scope).toBe('plugin');
        expect(viewerErrors[0].code).toBe('overlay-layer-refused');
        expect(viewerErrors[0].message).toContain('ghost:markers');
        expect(() => dispose()).not.toThrow();
    });
});
