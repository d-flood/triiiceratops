/**
 * `PluginMountHost` — the one bridge from core's chrome and overlay-layer render
 * sites to a plugin's framework-neutral DOM-mount thunk.
 *
 * The claim under test is the `untrack` in its attachment, and it is a claim about
 * THIRD-PARTY code: a plugin's thunk builds DOM, and what it reads while doing so
 * is not core's to bound. An attachment re-runs when anything read during its run
 * changes, so a thunk that touches genuinely reactive viewer state — `canvasId`,
 * the toolbar's open flag, anything a plugin might reasonably consult while
 * rendering — would silently enrol every one of those values as a remount
 * trigger, and the documented contract ("mounted when the container appears,
 * unmounted when it goes away") would be false for exactly the plugins that read
 * the most state.
 *
 * The test therefore uses a REAL `ViewerState` and a real command: a stand-in
 * `$state` would prove the mechanism but not that the members a plugin actually
 * reaches are the tracked kind.
 *
 * Deleting the `untrack` makes the second test fail (two mounts, one cleanup) and
 * leaves the first passing — the mount/cleanup lifecycle itself is unaffected.
 */

import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PluginMountHost from './PluginMountHost.svelte';
import { ViewerState } from '../state/viewer.svelte';

describe('PluginMountHost', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    function render(thunk: (node: HTMLElement) => () => void) {
        mounted = mount(PluginMountHost, {
            target: document.body,
            props: { mount: thunk },
        });
        flushSync();
    }

    it('runs the thunk on mount and its cleanup on unmount', async () => {
        const cleanup = vi.fn();
        const thunk = vi.fn(() => cleanup);

        render(thunk);
        expect(thunk).toHaveBeenCalledTimes(1);
        expect(cleanup).not.toHaveBeenCalled();

        await unmount(mounted!);
        mounted = null;
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('does not remount when viewer state the thunk read while mounting changes', () => {
        const state = new ViewerState();
        const cleanup = vi.fn();
        // A plugin building its DOM against viewer state. `toolbarOpen` is a
        // `command` member — reactive, notifying, and mutated by a first-party
        // command — so reading it here is precisely the tracked read a plugin
        // makes for free.
        const thunk = vi.fn((node: HTMLElement) => {
            node.dataset.toolbar = String(state.toolbarOpen);
            return cleanup;
        });

        render(thunk);
        expect(thunk).toHaveBeenCalledTimes(1);

        state.toggleToolbar();
        flushSync();

        // Without `untrack`, the attachment's dependency on `toolbarOpen` would
        // have re-run it: the plugin's DOM torn down and rebuilt because the
        // toolbar opened.
        expect(
            thunk,
            'the mount thunk ran again — a value it read became a remount trigger',
        ).toHaveBeenCalledTimes(1);
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('remounts when the thunk ITSELF is replaced', async () => {
        // The other half of the same seam: the thunk is read inside the tracked
        // scope on purpose, so a new thunk is a new mount. `untrack` covers what
        // the thunk reads, not the thunk.
        const props = $state({ mount: vi.fn(() => vi.fn()) });
        const first = props.mount;
        mounted = mount(PluginMountHost, {
            target: document.body,
            props,
        });
        flushSync();
        expect(first).toHaveBeenCalledTimes(1);

        const second = vi.fn(() => vi.fn());
        props.mount = second;
        flushSync();

        expect(second).toHaveBeenCalledTimes(1);
    });
});
