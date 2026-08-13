import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';

/**
 * The **canvas claim** reaching the picture, over a mounted viewer: the ticket's
 * demoable, which no unit of either half can show on its own.
 *
 * Two halves of one suppression have to agree, and they are computed in
 * different places — the placard from the renderer's frame loop
 * (`renderer/canvasRenderer.svelte.ts`), the strip's AV glyph from a `$derived`
 * in `ThumbnailGallery.svelte`. Claiming from an IDLE viewer is what tells them
 * apart: the strip updates on the flush whatever anyone does, while the frame
 * loop stops rescheduling once the viewport settles, so the placard moves only
 * because `CanvasHost` asks for a frame when the claim set changes. Without that
 * request the reader sees "core cannot show this" painted over a plugin's video
 * until they happen to pan.
 *
 * `0003-mvm-video` is the recipe the epic names, vendored in the corpus and
 * served here from disk. Nothing fetches its media: the placard exists precisely
 * because core issues no request for a canvas it cannot paint.
 */
const AV_DIR = join(import.meta.dirname, '../test/fixtures/manifests/av');
const MANIFEST = JSON.parse(
    readFileSync(join(AV_DIR, '0003-mvm-video.json'), 'utf8'),
);
const MANIFEST_ID: string = MANIFEST.id;
const CANVAS_ID: string = MANIFEST.items[0].id;

const PLACARD = '[data-testid="canvas-unsupported-placeholder"]';
const AV_GLYPH = '[data-testid="thumb-av-glyph"]';

async function settle(ms = 200) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

describe('a claimed canvas in a mounted viewer', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    const apps: Array<ReturnType<typeof mount>> = [];
    const originals = {
        rect: Element.prototype.getBoundingClientRect,
        context: HTMLCanvasElement.prototype.getContext,
        scrollIntoView: Element.prototype.scrollIntoView,
    };

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => MANIFEST,
        }));

        // happy-dom has no layout and no 2D context, and the renderer needs both
        // before it paints anything: an unmeasured container never lays a canvas
        // out, and `paint()` returns early without a context — either way the
        // placard layer stays empty for a reason that has nothing to do with
        // claims. The stubs are inert; nothing here asserts on pixels.
        Element.prototype.getBoundingClientRect = function () {
            return {
                x: 0,
                y: 0,
                width: 800,
                height: 600,
                top: 0,
                left: 0,
                right: 800,
                bottom: 600,
                toJSON: () => ({}),
            } as DOMRect;
        };
        HTMLCanvasElement.prototype.getContext = function (
            this: HTMLCanvasElement,
        ) {
            const drawn: Record<string | symbol, unknown> = { canvas: this };
            return new Proxy(drawn, {
                get(store, property) {
                    if (property in store) return store[property];
                    if (property === 'measureText') return () => ({ width: 0 });
                    return () => undefined;
                },
                set(store, property, value) {
                    store[property] = value;
                    return true;
                },
            }) as unknown as CanvasRenderingContext2D;
        } as typeof HTMLCanvasElement.prototype.getContext;
        Element.prototype.scrollIntoView = function () {};

        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) await unmount(app);
        target.remove();
        Element.prototype.getBoundingClientRect = originals.rect;
        HTMLCanvasElement.prototype.getContext = originals.context;
        Element.prototype.scrollIntoView = originals.scrollIntoView;
        vi.restoreAllMocks();
    });

    async function mountViewer() {
        const props = $state({
            manifestId: MANIFEST_ID,
            config: {
                gallery: { open: true, dockPosition: 'bottom' },
            } as Record<string, unknown>,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();
        return props;
    }

    const placards = () => target.querySelectorAll(PLACARD).length;
    const glyphs = () => target.querySelectorAll(AV_GLYPH).length;

    it('drops the unsupported presentation and its strip glyph, and brings both back on release', async () => {
        const props = await mountViewer();
        const state = props.viewerState;

        // The honest treatment for a canvas core cannot paint, in both places.
        expect(placards()).toBe(1);
        expect(glyphs()).toBe(1);

        state.ensurePluginUiState('av');
        const release = state.claimCanvas(CANVAS_ID, 'av');
        // Deliberately nothing else: no pan, no zoom, no navigation. A claim on
        // an idle viewer has to move the picture by itself.
        await settle();

        expect(placards()).toBe(0);
        expect(glyphs()).toBe(0);
        // The canvas keeps its place: a claim suppresses the treatment, it does
        // not remove the canvas from the viewer.
        expect(target.querySelectorAll('.thumb-item')).toHaveLength(1);
        expect(state.canvasId).toBe(CANVAS_ID);

        release();
        await settle();

        // And the honest placard comes back — a released canvas is core's
        // again, and nothing is rendering over it.
        expect(placards()).toBe(1);
        expect(glyphs()).toBe(1);
    });

    it('leaves a canvas nobody claimed alone', async () => {
        const props = await mountViewer();
        const state = props.viewerState;

        state.ensurePluginUiState('av');
        state.claimCanvas('https://example.test/canvas/some-other', 'av');
        await settle();

        expect(placards()).toBe(1);
        expect(glyphs()).toBe(1);
    });
});
