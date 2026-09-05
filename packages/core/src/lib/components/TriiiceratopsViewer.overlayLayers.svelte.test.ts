/**
 * The overlay-layer RENDER SITE, in jsdom.
 *
 * `viewer.pluginUnregister.test.ts` can only say that a layer's record left the
 * registry: viewer state never calls a layer's `mount`, so it can never observe
 * the cleanup that returns. The browser spec
 * (`tests/canvas-renderer-overlay-layer.spec.ts`) observes everything, but it is
 * Chromium-only, so on any other browser — and in every `pnpm test` run — the
 * ownership ticket's "disposes that plugin's layers, running their mount cleanups
 * and removing their containers" had no assertion at all.
 *
 * This file is that assertion. It mounts the real viewer and drives the real
 * `{#each}`, so it covers the half of the claim that does not need a painted
 * image: the container is created once, the mount thunk runs against it, disposal
 * (by either path) removes it and runs the cleanup, and the keying keeps a
 * survivor on its own node.
 *
 * What it deliberately does NOT cover, because happy-dom has no layout: the
 * container's ORIGIN being `canvasToScreen`'s, and its surviving a manifest
 * change (which needs a renderer that really mounts and remounts). Those stay in
 * the browser spec.
 */

import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import type { ViewerState } from '../state/viewer.svelte';

const WRAPPER = '.plugin-overlay-layer';

describe('TriiiceratopsViewer — plugin overlay layers', () => {
    let app: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (app) {
            await unmount(app);
            app = null;
        }
        document.body.innerHTML = '';
    });

    /**
     * Mount the viewer with no manifest.
     *
     * The `{#each}` for overlay layers sits OUTSIDE the `{#if}` that mounts the
     * renderer, which is what makes a container's lifetime independent of the
     * image — so a viewer with no manifest at all is enough to exercise it, and
     * that is itself part of the contract ("registering before any renderer has
     * mounted is valid").
     */
    async function mountViewer(): Promise<ViewerState> {
        const props = $state({
            viewerState: undefined as unknown as ViewerState,
        });
        app = mount(TriiiceratopsViewer, { target: document.body, props });
        await tick();
        expect(props.viewerState, 'the viewer exposed no state').toBeTruthy();
        return props.viewerState;
    }

    function wrappers(): Element[] {
        return [...document.querySelectorAll(WRAPPER)];
    }

    /** A layer whose mount records the nodes it was handed and its cleanups. */
    function recordingLayer(id: string) {
        const nodes: HTMLElement[] = [];
        const cleanup = vi.fn();
        const layerMount = vi.fn((node: HTMLElement) => {
            nodes.push(node);
            node.dataset.testLayer = id;
            return cleanup;
        });
        return { id, mount: layerMount, nodes, cleanup };
    }

    it('places a container per layer and calls the plugin’s mount with it', async () => {
        const state = await mountViewer();
        // The precondition a real activation establishes before `view.mount` runs.
        state.ensurePluginUiState('p1');
        const layer = recordingLayer('p1:markers');

        state.registerOverlayLayer(layer);
        await tick();

        expect(wrappers()).toHaveLength(1);
        expect(layer.mount).toHaveBeenCalledTimes(1);
        // The plugin's DOM goes inside the wrapper that provides the box —
        // `PluginMountHost`'s own element is `display: contents` and provides none.
        expect(layer.nodes[0].closest(WRAPPER)).toBe(wrappers()[0]);
        expect(layer.cleanup).not.toHaveBeenCalled();
    });

    it('removes the container and runs the mount cleanup when the layer is disposed', async () => {
        const state = await mountViewer();
        state.ensurePluginUiState('p1');
        const layer = recordingLayer('p1:markers');

        const dispose = state.registerOverlayLayer(layer);
        await tick();
        const dispose2 = state.registerOverlayLayer(layer);
        expect(wrappers()).toHaveLength(1);

        dispose();
        await tick();

        expect(wrappers()).toHaveLength(0);
        expect(layer.cleanup).toHaveBeenCalledTimes(1);

        // Idempotent, and so is the refused duplicate's no-op dispose: neither
        // runs the cleanup a second time.
        dispose();
        dispose2();
        await tick();
        expect(layer.cleanup).toHaveBeenCalledTimes(1);
    });

    it('runs the mount cleanup and removes the container when the plugin is unregistered', async () => {
        const state = await mountViewer();
        state.ensurePluginUiState('p1');
        const layer = recordingLayer('p1:markers');
        const dispose = state.registerOverlayLayer(layer);
        await tick();
        expect(wrappers()).toHaveLength(1);

        // The ownership backstop: a plugin whose own teardown never calls its
        // dispose must not leave DOM on the image. Removing the container alone
        // would take the plugin's elements with it, so the CLEANUP COUNT is the
        // claim, not the elements' absence.
        state.unregisterPlugin('p1');
        await tick();

        expect(wrappers()).toHaveLength(0);
        expect(layer.cleanup).toHaveBeenCalledTimes(1);

        // The plugin's own dispose arriving late is a no-op, not a second teardown.
        dispose();
        await tick();
        expect(layer.cleanup).toHaveBeenCalledTimes(1);
    });

    it('runs every layer’s mount cleanup on destroyAllPlugins', async () => {
        const state = await mountViewer();
        state.ensurePluginUiState('p1');
        state.ensurePluginUiState('p2');
        const first = recordingLayer('p1:markers');
        const second = recordingLayer('p2:markers');
        state.registerOverlayLayer(first);
        state.registerOverlayLayer(second);
        await tick();
        expect(wrappers()).toHaveLength(2);

        state.destroyAllPlugins();
        await tick();

        expect(wrappers()).toHaveLength(0);
        expect(first.cleanup).toHaveBeenCalledTimes(1);
        expect(second.cleanup).toHaveBeenCalledTimes(1);
    });

    it('keeps a surviving layer on its own node when a sibling comes and goes', async () => {
        const state = await mountViewer();
        state.ensurePluginUiState('p1');
        const first = recordingLayer('p1:first');
        const second = recordingLayer('p1:second');

        const disposeFirst = state.registerOverlayLayer(first);
        await tick();
        state.registerOverlayLayer(second);
        await tick();
        expect(wrappers()).toHaveLength(2);
        expect(first.mount).toHaveBeenCalledTimes(1);

        // Unkeyed, node reuse would be positional: disposing the FIRST would hand
        // the survivor a different node, and `PluginMountHost` remounts when its
        // node is recreated. The `{#each}` is keyed on layer id precisely so this
        // does not happen.
        disposeFirst();
        await tick();

        expect(wrappers()).toHaveLength(1);
        expect(
            second.mount,
            'the survivor was remounted — the each block lost its keying',
        ).toHaveBeenCalledTimes(1);
        expect(second.nodes).toHaveLength(1);
        expect(second.cleanup).not.toHaveBeenCalled();
    });
});
