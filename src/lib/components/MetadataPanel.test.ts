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
