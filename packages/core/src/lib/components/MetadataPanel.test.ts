import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import MetadataPanelTestHost from './MetadataPanelTestHost.svelte';
import { manifestWithProviderHomepages } from '../test/fixtures/manifests';

describe('MetadataPanel provider rendering', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    it('renders all provider homepage links with their own labels', () => {
        mounted = mount(MetadataPanelTestHost, {
            target: document.body,
            props: {
                manifest: manifestWithProviderHomepages,
            },
        });

        flushSync();

        const providerLinks = [
            document.querySelector(
                'a[href="https://digital.library.ucla.edu/"]',
            ),
            document.querySelector(
                'a[href="https://www.loc.gov/collections/fsa-owi-black-and-white-negatives/about-this-collection/"]',
            ),
        ];

        expect(providerLinks).toHaveLength(2);
        expect(providerLinks.map((link) => link?.getAttribute('href'))).toEqual(
            [
                'https://digital.library.ucla.edu/',
                'https://www.loc.gov/collections/fsa-owi-black-and-white-negatives/about-this-collection/',
            ],
        );
        expect(providerLinks.map((link) => link?.textContent?.trim())).toEqual([
            'UCLA Library Digital Collections',
            'US Library of Congress data about this collection',
        ]);
        expect(document.body.textContent).toContain('UCLA Library');
    });
});

/**
 * The four manifest-scalar reads the `remove-manifesto` epic rewired, in BOTH
 * IIIF versions.
 *
 * These shipped with no coverage at all. Before ticket 09 the panel read title
 * through `manifest.getLabel?.()` with no raw fallback whatsoever, and summary,
 * attribution and rights through accessors with a v3-only raw path -- so a
 * mechanical deletion of the accessor rungs would have blanked the title on
 * EVERY manifest and the other three on every v2 manifest, silently.
 *
 * The behavioral golden cannot catch this: it records no metadata-panel output.
 * That is precisely why these need to be pinned here.
 */
describe('MetadataPanel manifest scalars, v2 and v3', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    function render(manifest: any) {
        mounted = mount(MetadataPanelTestHost, {
            target: document.body,
            props: { manifest },
        });
        flushSync();
        return document.body.textContent ?? '';
    }

    /**
     * Summary and attribution go through `SanitizedHtml`, which renders an
     * empty node under jsdom -- so their text is not assertable here. Their
     * containers sit behind `{#if summary}` / `{#if attribution}`, so the
     * element existing proves the derivation resolved to a non-empty string,
     * which is exactly the v2-vs-v3 read under test. A regression that read
     * only the v3 spelling would resolve `''` and render no element at all.
     */
    const rendered = (selector: string) =>
        document.querySelector(selector) !== null;

    it('reads title, summary, attribution and rights from a IIIF v3 manifest', () => {
        const text = render({
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            id: 'http://example.org/v3/manifest',
            type: 'Manifest',
            label: { en: ['A v3 Book'] },
            summary: { en: ['Summary in v3 spelling.'] },
            requiredStatement: {
                label: { en: ['Attribution'] },
                value: { en: ['Held by the v3 Library.'] },
            },
            rights: 'http://creativecommons.org/licenses/by/4.0/',
            items: [],
        });

        expect(text).toContain('A v3 Book');
        expect(rendered('.summary')).toBe(true);
        expect(text).toContain('Attribution');
        expect(
            document.querySelector(
                'a[href="http://creativecommons.org/licenses/by/4.0/"]',
            ),
        ).not.toBeNull();
    });

    it('reads title, description, attribution and license from a IIIF v2 manifest', () => {
        // Every property here is spelled differently from v3, and `license` is
        // an ARRAY -- a shape the removed accessor would have handed straight
        // into an href and stringified.
        const text = render({
            '@context': 'http://iiif.io/api/presentation/2/context.json',
            '@id': 'http://example.org/v2/manifest',
            '@type': 'sc:Manifest',
            label: 'A v2 Book',
            description: 'Description in v2 spelling.',
            attribution: 'Held by the v2 Library.',
            license: [
                'http://creativecommons.org/licenses/by-nc/4.0/',
                'http://example.org/second-license',
            ],
            sequences: [],
        });

        expect(text).toContain('A v2 Book');
        // `description`, not `summary`; `attribution`, not `requiredStatement`.
        expect(rendered('.summary')).toBe(true);
        expect(text).toContain('Attribution');
        expect(
            document.querySelector(
                'a[href="http://creativecommons.org/licenses/by-nc/4.0/"]',
            ),
        ).not.toBeNull();
    });

    it('reads a v2 title given as a JSON-LD @value array', () => {
        // The spelling `vendored/riksarkivetscblarge.json` uses. Reading only
        // `value`/`_value` here yields '' and the panel shows no title at all.
        const text = render({
            '@context': 'http://iiif.io/api/presentation/2/context.json',
            '@id': 'http://example.org/v2/manifest',
            '@type': 'sc:Manifest',
            label: [{ '@value': 'Bild 6', '@language': 'sv' }],
            sequences: [],
        });

        expect(text).toContain('Bild 6');
    });
});
