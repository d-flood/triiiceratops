import { describe, expect, it } from 'vitest';

import {
    createHeadlessViewerState,
    flush,
} from '@triiiceratops/plugin-sdk/testing';

import { createViewerStateMirror } from './viewerMirror.svelte';

/**
 * The cross-realm bridge, against a REAL `ViewerState`. The controller's gates
 * read the mirror, not core, so a field the mirror does not carry is a gate that
 * never fires in a real viewer no matter what the component tests say.
 */
describe('ViewerStateMirror', () => {
    it('follows the annotatable scope across a canvas claim', async () => {
        const state = createHeadlessViewerState();
        const page = 'https://example.test/canvas/page';
        const film = 'https://example.test/canvas/film';
        state.ensurePluginUiState('av');
        state.visibleCanvasIds = [page, film];

        const { mirror, destroy } = createViewerStateMirror(state);
        expect(mirror.annotatableCanvasIds).toEqual([page, film]);

        const release = state.claimCanvas(film, 'av');
        await flush();
        expect(mirror.annotatableCanvasIds).toEqual([page]);

        release();
        await flush();
        expect(mirror.annotatableCanvasIds).toEqual([page, film]);

        destroy();
        state.destroy();
    });
});
