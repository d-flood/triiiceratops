// @vitest-environment node

import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';

describe('TriiiceratopsViewer on the server', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches nothing for a known manifest id', () => {
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        const { body } = render(TriiiceratopsViewer, {
            props: { manifestId: 'https://example.org/iiif/book/manifest' },
        });

        expect(body).toContain('triiiceratops-viewer');
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
