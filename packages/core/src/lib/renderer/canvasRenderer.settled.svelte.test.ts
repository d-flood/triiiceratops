import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';

import { createCanvasRenderer } from './canvasRenderer.svelte';
import { m } from '../state/i18n.svelte';
import { ViewerState } from '../state/viewer.svelte';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

const MANIFEST = JSON.parse(
    readFileSync(
        join(
            import.meta.dirname,
            '../test/fixtures/manifests/cookbook/0009-book-1.json',
        ),
        'utf8',
    ),
);
const MANIFEST_ID: string = MANIFEST.id;
const FIRST_CANVAS: string = MANIFEST.items[0].id;
const THIRD_CANVAS: string = MANIFEST.items[2].id;

async function wait(ms: number) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

describe('renderer settlement on resize and zero-size surfaces', () => {
    const mockFetch = vi.fn();
    let surface: ReturnType<typeof installViewerSurface>;
    let root: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let disposeRoot: (() => void) | null = null;
    let detach: (() => void) | undefined;

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => MANIFEST,
        }));

        root = document.createElement('div');
        canvas = document.createElement('canvas');
        root.appendChild(canvas);
        document.body.appendChild(root);
    });

    afterEach(() => {
        detach?.();
        detach = undefined;
        disposeRoot?.();
        disposeRoot = null;
        root.remove();
        surface?.restore();
        vi.restoreAllMocks();
    });

    async function mountRenderer(initialBox = { width: 800, height: 600 }) {
        surface = installViewerSurface(initialBox);
        const viewerState = new ViewerState(MANIFEST_ID, FIRST_CANVAS);
        await wait(150);

        let renderer!: ReturnType<typeof createCanvasRenderer>;
        disposeRoot = $effect.root(() => {
            renderer = createCanvasRenderer({
                viewerState,
                messages: m,
                getRefitSignal: () => `0|${viewerState.canvasId}|0|`,
            });
            detach = renderer.mount(root, canvas);
        });

        renderer.refitForCurrentWorld();
        await wait(100);
        return { viewerState, renderer };
    }

    it('settles once after a multi-step container resize stops', async () => {
        const { viewerState } = await mountRenderer();

        let settled = 0;
        const off = viewerState.subscribeSettled(() => {
            settled += 1;
        });

        try {
            viewerState.zoomTo(viewerState.viewportScale * 3);
            await vi.waitFor(() => expect(settled).toBe(1), { timeout: 3000 });
            settled = 0;

            const steps = Array.from({ length: 10 }, (_, index) => ({
                width: 800 + (index + 1) * 16,
                height: 600,
            }));
            await surface.stepBox(steps);
            expect(settled).toBe(0);

            await vi.waitFor(() => expect(settled).toBe(1), { timeout: 1000 });
            await wait(250);
            expect(settled).toBe(1);
        } finally {
            off();
        }
    });

    it('settles once after a multi-step expansion from zero size stops', async () => {
        const { viewerState } = await mountRenderer({ width: 0, height: 0 });

        let settled = 0;
        const off = viewerState.subscribeSettled(() => {
            settled += 1;
        });

        try {
            await surface.stepBox([
                { width: 150, height: 600 },
                { width: 300, height: 600 },
                { width: 450, height: 600 },
            ]);
            expect(settled).toBe(0);

            await vi.waitFor(() => expect(settled).toBe(1), { timeout: 1000 });
            await wait(250);
            expect(settled).toBe(1);
        } finally {
            off();
        }
    });

    it('reports null viewportBounds and never settles while the surface is zero-size', async () => {
        const { viewerState, renderer } = await mountRenderer({
            width: 0,
            height: 0,
        });

        let settled = 0;
        const off = viewerState.subscribeSettled(() => {
            settled += 1;
        });

        try {
            renderer.requestFrame();
            await wait(100);
            expect(viewerState.viewportBounds).toBeNull();
            expect(settled).toBe(0);

            await surface.stepBox([{ width: 800, height: 600 }]);
            expect(viewerState.viewportBounds).not.toBeNull();
            await vi.waitFor(() => expect(settled).toBe(1), { timeout: 1000 });

            await surface.stepBox([{ width: 0, height: 0 }]);
            await wait(300);
            expect(viewerState.viewportBounds).toBeNull();
            expect(settled).toBe(1);
        } finally {
            off();
        }
    });

    it('keeps the view and stays quiet across a hide and show', async () => {
        const { viewerState } = await mountRenderer();

        let settled = 0;
        const off = viewerState.subscribeSettled(() => {
            settled += 1;
        });

        try {
            viewerState.zoomTo(viewerState.viewportScale * 3);
            await vi.waitFor(() => expect(settled).toBe(1), { timeout: 3000 });
            const zoomed = viewerState.viewportScale;
            const bounds = viewerState.viewportBounds;

            await surface.stepBox([{ width: 0, height: 0 }]);
            await surface.stepBox([{ width: 800, height: 600 }]);
            await wait(300);

            expect(viewerState.viewportScale).toBe(zoomed);
            expect(viewerState.viewportBounds).toEqual(bounds);
            expect(settled).toBe(1);
        } finally {
            off();
        }
    });

    it('refits on show when navigation arrives while hidden', async () => {
        const { viewerState, renderer } = await mountRenderer();
        const fit = viewerState.viewportScale;
        viewerState.zoomTo(fit * 3);
        await wait(1000);

        await surface.stepBox([{ width: 0, height: 0 }]);
        viewerState.setCanvas(THIRD_CANVAS);
        renderer.refitForCurrentWorld();
        await surface.stepBox([{ width: 800, height: 600 }]);
        await wait(100);

        expect(viewerState.viewportScale).toBeCloseTo(fit);
    });
});
