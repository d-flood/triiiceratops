/**
 * What a throwing `mount` must not leave behind.
 *
 * Its own file because it mocks `svelte`, which every other suite here needs
 * real.
 *
 * The stage manager is built BEFORE the panel mounts — the stages exist whether
 * or not the panel is open — so a mount that throws never returns the cleanup
 * that would have destroyed it. The SDK and core release what they track
 * (styles, locale, the overlay layer, the claims); the manager's per-frame
 * `subscribeFrame` is a raw `ViewerState` subscription neither of them knows
 * about, and it holds every `<video>` for the viewer's lifetime.
 */

import {
    createTestViewerContext,
    flush,
} from '@triiiceratops/plugin-sdk/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('svelte', async (importOriginal) => ({
    ...(await importOriginal<typeof import('svelte')>()),
    mount: () => {
        throw new Error('mount blew up');
    },
}));

const { AvPlugin } = await import('./plugin');

const VIDEO_MANIFEST = {
    id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
    json: JSON.parse(
        readFileSync(
            join(
                import.meta.dirname,
                '../../core/src/lib/test/fixtures/manifests/av/0003-mvm-video.json',
            ),
            'utf8',
        ),
    ),
};

describe('a mount that throws', () => {
    it('unwinds the stage manager instead of orphaning its subscriptions', async () => {
        const tc = createTestViewerContext({
            uiId: 'av',
            fixtures: { manifest: VIDEO_MANIFEST },
        });
        await flush();

        expect(() =>
            AvPlugin.view.mount(document.createElement('div'), tc.context),
        ).toThrow('mount blew up');
        await flush();

        // Everything `stages.destroy()` owns, read back off the real state: the
        // claims, and the one overlay layer. A manager left running would still
        // hold both — and the frame subscription behind them.
        expect(tc.viewerState.claimedCanvases.size).toBe(0);
        expect(tc.viewerState.overlayLayers).toHaveLength(0);
        // The failure still reaches the SDK, which reports it and retries.
        expect(tc.styles.installed.every((install) => install.released)).toBe(
            true,
        );
    });
});
