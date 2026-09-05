import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import SearchPanelTestHost from './SearchPanelTestHost.svelte';
import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import { manifestV2WithSearch } from '../test/fixtures/manifests';

/**
 * What the search panel does with a `SearchProvider`'s excerpt text.
 *
 * `before`, `match` and `after` are public API — any host provider, and any
 * remote IIIF Content Search service, fills them. They reached four raw
 * `{@html}` sinks with nothing but a `&lt;mark&gt;` un-escaper in the way, so a
 * hostile search service could execute script in the host page. These tests
 * pin the fix at the seam an integrator sees: rendered DOM from a real provider
 * through a real `ViewerState`.
 */

const SCRIPT_PAYLOAD = '<script>alert(1)</script>';

async function mountPanelWithHits(hits: any[]) {
    const json = structuredClone(manifestV2WithSearch) as any;
    json['@id'] = `http://example.org/manifest/panel-${Math.random()}`;
    const manifestId = json['@id'];

    const viewerState = new ViewerState();
    await viewerState.setManifestData(manifestId, json);
    viewerState.setSearchProvider(async () => [
        { canvasIndex: 0, canvasLabel: 'Page 1', hits },
    ]);
    await viewerState.search('term');
    viewerState.showSearchPanel = true;

    const mounted = mount(SearchPanelTestHost, {
        target: document.body,
        props: { viewerState },
    });
    flushSync();

    return { mounted, manifestId };
}

describe('SearchPanel excerpts', () => {
    let mounted: ReturnType<typeof mount> | null = null;
    let manifestId: string | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        if (manifestId) {
            manifestsState.clearManifest(manifestId);
            manifestId = null;
        }
        document.body.innerHTML = '';
    });

    it('renders a provider script payload as visible text, not an element', async () => {
        ({ mounted, manifestId } = await mountPanelWithHits([
            {
                type: 'hit',
                before: `before ${SCRIPT_PAYLOAD} `,
                match: `${SCRIPT_PAYLOAD}term`,
                after: ` after ${SCRIPT_PAYLOAD}`,
            },
            { type: 'resource', match: `resource ${SCRIPT_PAYLOAD}` },
        ]));

        const excerpts = document.querySelector('.excerpts');
        expect(excerpts).not.toBeNull();
        expect(excerpts!.querySelector('script')).toBeNull();
        expect(document.querySelectorAll('script')).toHaveLength(0);
        expect(excerpts!.textContent).toContain(SCRIPT_PAYLOAD);
        expect(excerpts!.textContent).toContain('before ');
        expect(excerpts!.textContent).toContain(' after ');
        expect(excerpts!.textContent).toContain('resource ');
    });

    it('renders a literal <mark> term inside a real mark element', async () => {
        ({ mounted, manifestId } = await mountPanelWithHits([
            {
                type: 'hit',
                before: 'This is a ',
                match: '<mark>term</mark>',
                after: ' in context',
            },
        ]));

        const marks = document.querySelectorAll('.excerpts mark');
        expect(marks).toHaveLength(1);
        expect(marks[0].textContent).toBe('term');
        expect(document.querySelector('.excerpts')!.textContent).toContain(
            'This is a ',
        );
    });

    it('renders an entity-encoded &lt;mark&gt; term inside a real mark element', async () => {
        ({ mounted, manifestId } = await mountPanelWithHits([
            {
                type: 'resource',
                match: 'a &lt;mark&gt;term&lt;/mark&gt; in context',
            },
        ]));

        const marks = document.querySelectorAll('.excerpts mark');
        expect(marks).toHaveLength(1);
        expect(marks[0].textContent).toBe('term');
        expect(document.querySelector('.excerpts')!.textContent).toBe(
            'a term in context',
        );
    });
});
