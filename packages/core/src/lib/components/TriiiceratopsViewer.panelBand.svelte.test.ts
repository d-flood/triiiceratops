/**
 * On a narrow viewer the open panels dock as a band under the canvas rather
 * than as side columns, so the control bar keeps the viewer's full width.
 */

import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { mount, tick, unmount } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import { manifestsState } from '../state/manifests.svelte';
import { manifestV2WithoutSearch } from '../test/fixtures/manifests';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

const MANIFEST_ID = manifestV2WithoutSearch['@id'] as string;

// Panels arrive with Svelte transitions, and this DOM's Web Animations API is
// incomplete enough to throw mid-flush; keep them inert.
beforeAll(() => {
    Element.prototype.animate = function () {
        return {
            onfinish: null,
            oncancel: null,
            cancel() {},
            finish() {},
            play() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            finished: Promise.resolve(),
            currentTime: 0,
            playState: 'finished',
        } as unknown as Animation;
    };
});

async function settle(ms = 120) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

describe('where an open panel docks', () => {
    let target: HTMLElement;
    let surface: ReturnType<typeof installViewerSurface>;
    const apps: Array<ReturnType<typeof mount>> = [];

    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                json: async () => structuredClone(manifestV2WithoutSearch),
            })),
        );
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) await unmount(app);
        manifestsState.clearManifest(MANIFEST_ID);
        target.remove();
        surface.restore();
        vi.unstubAllGlobals();
    });

    async function mountViewerAt(width: number, config = {}) {
        surface = installViewerSurface({ width, height: 800 });
        const props = $state({
            viewerState: undefined as any,
            manifestId: MANIFEST_ID,
            config,
        });
        apps.push(mount(TriiiceratopsViewer, { target, props }));
        await settle();
        props.viewerState.showMetadataPanel = true;
        await settle();
        return props.viewerState;
    }

    it('takes a side column on a wide viewer', async () => {
        await mountViewerAt(900);
        expect(target.querySelector('.panel-host')).not.toBeNull();
        expect(target.querySelector('.panel-band')).toBeNull();
    });

    it('takes a band under the canvas on a narrow viewer', async () => {
        await mountViewerAt(390);
        expect(target.querySelector('.panel-band')).not.toBeNull();
        expect(target.querySelector('.panel-host')).toBeNull();
        expect(target.querySelector('.panel-band')?.textContent).toContain(
            manifestV2WithoutSearch.label,
        );
    });

    it('docks a split toolbar as the rail beside the band', async () => {
        await mountViewerAt(390, { controls: 'split', toolbarOpen: true });
        expect(target.querySelector('.toolbar-rail-host')).not.toBeNull();
    });
});
