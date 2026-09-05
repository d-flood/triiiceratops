import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

/**
 * A **companion phase** change must not refit the view.
 *
 * The host refits whenever the world's geometry changes, and a refit overwrites
 * the reader's centre and scale. A phase change leaves every rect exactly where
 * it was — geometry is decided once and never by the phase — so pressing play
 * must not throw a zoomed-in reader back to a fit (user story 14). Only a
 * mounted viewer can show that: it is the wiring between the renderer's change
 * signal and `refitForCurrentWorld` that is under test, not either half.
 *
 * `0013-placeholderCanvas` is the corpus's placeholder shape, vendored and
 * served here from disk.
 */
const AV_DIR = join(import.meta.dirname, '../test/fixtures/manifests/av');
const MANIFEST = JSON.parse(
    readFileSync(join(AV_DIR, '0013-placeholderCanvas.json'), 'utf8'),
);
const MANIFEST_ID: string = MANIFEST.id;
const CANVAS_ID: string = MANIFEST.items[0].id;

/** The centre, within a canvas unit or two of where the reader left it. */
function expectCentredNear(
    state: { viewportCentre: { x: number; y: number } | null },
    x: number,
    y: number,
) {
    const centre = state.viewportCentre;
    expect(centre).not.toBeNull();
    expect(Math.abs(centre!.x - x)).toBeLessThan(2);
    expect(Math.abs(centre!.y - y)).toBeLessThan(2);
}

async function settle(ms = 200) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

describe('a companion phase change in a mounted viewer', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    const apps: Array<ReturnType<typeof mount>> = [];
    let surface: ReturnType<typeof installViewerSurface>;

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => MANIFEST,
        }));

        surface = installViewerSurface();

        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) await unmount(app);
        target.remove();
        surface.restore();
        vi.restoreAllMocks();
    });

    async function mountViewer() {
        const props = $state({
            manifestId: MANIFEST_ID,
            config: {} as Record<string, unknown>,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settle();
        return props;
    }

    it('leaves the reader’s pan where it was', async () => {
        const props = await mountViewer();
        const state = props.viewerState;

        state.ensurePluginUiState('av');
        state.claimCanvas(CANVAS_ID, 'av');
        state.setCompanionPhase(CANVAS_ID, 'av', 'placeholder');
        await settle();

        const fitted = state.viewportScale;
        expect(fitted).toBeGreaterThan(0);

        // Away from the fit's centre of (320, 180), which is where a refit
        // would put it back. Asserted with a tolerance rather than exactly: the
        // pan is eased, so the last fraction of a canvas unit is still arriving.
        state.panTo({ x: 200, y: 100 });
        await settle(800);
        expectCentredNear(state, 200, 100);

        // The schedule a claimant runs on play and on pause. The rect is
        // identical across all three phases, so none of them is a new world.
        state.setCompanionPhase(CANVAS_ID, 'av', 'none');
        await settle();
        expectCentredNear(state, 200, 100);
        expect(state.viewportScale).toBeCloseTo(fitted, 6);

        state.setCompanionPhase(CANVAS_ID, 'av', 'accompanying');
        await settle();
        expectCentredNear(state, 200, 100);

        state.setCompanionPhase(CANVAS_ID, 'av', 'placeholder');
        await settle();
        expectCentredNear(state, 200, 100);
        expect(state.viewportScale).toBeCloseTo(fitted, 6);
    });

    it('leaves the reader’s zoom where it was when a plugin claims the canvas', async () => {
        const props = await mountViewer();
        const state = props.viewerState;

        const fitted = state.viewportScale;
        state.zoomTo(fitted / 2);
        await settle(800);

        const zoomed = state.viewportScale;
        expect(zoomed).toBeLessThan(fitted);

        // A claim alone changes nothing about the geometry (user story 27).
        state.ensurePluginUiState('av');
        state.claimCanvas(CANVAS_ID, 'av');
        await settle();

        expect(state.viewportScale).toBeCloseTo(zoomed, 2);
    });
});
