/**
 * **A configured search query belongs to the manifest it arrived with.**
 *
 * `config.search.query` is how a host opens the viewer on a search rather than
 * on a blank panel, and a host that moves the reader between materials changes
 * the manifest and the query in the same update. `setManifest` is asynchronous,
 * so config lands while the OUTGOING manifest is still the loaded one — fully
 * loaded, and so indistinguishable from an arrival to anything looking only at
 * the entry. A query resolved then goes to the wrong search service, or to none
 * at all, and answers "no results" for a query the reader can run by hand and
 * watch succeed.
 *
 * Driven through the viewer's own props, because the gate is the agreement
 * between the manifest PROP and the manifest the state holds, and only a
 * mounted component has both.
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
import { manifestV2WithSearch } from '../test/fixtures/manifests';
import { searchResponseWithHits } from '../test/fixtures/searchResponses';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

const SEARCHABLE_ID = 'http://example.org/iiif/searchable';
const PLAIN_ID = 'http://example.org/iiif/plain';
const SEARCH_ENDPOINT = 'http://example.org/search-service';

/**
 * A two-canvas manifest under `id`, declaring a v1 search service or none.
 *
 * The canvases are the ones `searchResponseWithHits` targets, so a response
 * parsed against this manifest's canvas list produces groups and one parsed
 * against a different manifest's produces none — which is exactly the
 * difference this file is about.
 */
function manifest(id: string, searchable: boolean) {
    const json = structuredClone(manifestV2WithSearch) as Record<
        string,
        unknown
    >;
    json['@id'] = id;
    if (searchable) {
        json.service = {
            '@id': SEARCH_ENDPOINT,
            profile: 'http://iiif.io/api/search/1/search',
        };
    } else {
        delete json.service;
    }
    return json;
}

// The DOM here ships an incomplete Web Animations API, and opening the search
// panel runs a Svelte transition that calls `element.animate()`. The missing
// pieces throw mid-flush and abort the effects scheduled after the throw — this
// file's subject among them — so the transitions are kept inert.
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

describe('a search query configured alongside a manifest change', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    let surface: ReturnType<typeof installViewerSurface>;
    const apps: Array<ReturnType<typeof mount>> = [];

    beforeEach(() => {
        mockFetch.mockReset();
        // Routed by URL rather than by call order: the manifest fetch and the
        // search fetch interleave differently depending on the very sequencing
        // under test, so an ordered mock would encode the bug as the fixture.
        mockFetch.mockImplementation(async (input: unknown) => {
            const url = String(input);
            if (url.startsWith(SEARCH_ENDPOINT)) {
                return { ok: true, json: async () => searchResponseWithHits };
            }
            if (url === SEARCHABLE_ID) {
                return { ok: true, json: async () => manifest(url, true) };
            }
            if (url === PLAIN_ID) {
                return { ok: true, json: async () => manifest(url, false) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });
        vi.stubGlobal('fetch', mockFetch);

        surface = installViewerSurface({ width: 800, height: 600 });
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) await unmount(app);
        manifestsState.clearManifest(SEARCHABLE_ID);
        manifestsState.clearManifest(PLAIN_ID);
        target.remove();
        surface.restore();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function mountViewer() {
        const state: {
            viewerState?: any;
            manifestId: string;
            config: Record<string, unknown>;
        } = $state({
            viewerState: undefined,
            manifestId: PLAIN_ID,
            config: { search: { open: false } },
        });
        apps.push(mount(TriiiceratopsViewer, { target, props: state }));
        return state;
    }

    /** Every search URL the viewer has asked for, in order. */
    function searchCalls() {
        return mockFetch.mock.calls
            .map(([input]) => String(input))
            .filter((url) => url.startsWith(SEARCH_ENDPOINT));
    }

    it('runs against the incoming manifest, not the one being left', async () => {
        const props = mountViewer();
        await settle();
        expect(props.viewerState.manifestId).toBe(PLAIN_ID);

        // Both props in one update, which is what a host switching material
        // does. The manifest being left declares no search service at all, so a
        // query resolved against it could only ever answer nothing.
        props.manifestId = SEARCHABLE_ID;
        props.config = { search: { open: true, query: 'term' } };
        await settle(400);

        expect(searchCalls()).toEqual([`${SEARCH_ENDPOINT}?q=term`]);
        expect(props.viewerState.manifestId).toBe(SEARCHABLE_ID);
        expect(props.viewerState.searchQuery).toBe('term');
        expect(props.viewerState.searchResults.length).toBeGreaterThan(0);
        expect(props.viewerState.pendingSearchQuery).toBeNull();
    });

    it('runs a query configured with no manifest change of its own', async () => {
        const props = mountViewer();
        props.manifestId = SEARCHABLE_ID;
        await settle();
        expect(props.viewerState.manifestId).toBe(SEARCHABLE_ID);

        // The manifest is settled and the query is the only thing that moves.
        // Queueing must not mean waiting for a manifest change that never comes.
        props.config = { search: { open: true, query: 'term' } };
        await settle(400);

        expect(searchCalls()).toEqual([`${SEARCH_ENDPOINT}?q=term`]);
        expect(props.viewerState.searchResults.length).toBeGreaterThan(0);
    });
});
