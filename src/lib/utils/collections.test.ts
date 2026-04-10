import { describe, expect, it } from 'vitest';

import { collectionV3WithNavDates } from '../test/fixtures/manifests';
import {
    parseCollection,
    sortCollectionItems,
    type CollectionItem,
} from './collections';

describe('collection helpers', () => {
    it('preserves navDate when parsing v3 collection items', () => {
        expect(parseCollection(collectionV3WithNavDates)).toEqual([
            {
                id: 'http://example.org/manifest/1987',
                type: 'Manifest',
                label: '1987 Map',
                thumbnail: undefined,
                navDate: '1987-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/manifest/undated',
                type: 'Manifest',
                label: 'Undated Map',
                thumbnail: undefined,
                navDate: undefined,
            },
            {
                id: 'http://example.org/manifest/1986',
                type: 'Manifest',
                label: '1986 Map',
                thumbnail: undefined,
                navDate: '1986-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/collection/subcollection',
                type: 'Collection',
                label: 'Subcollection',
                thumbnail: undefined,
                navDate: '1988-01-01T00:00:00Z',
            },
        ]);
    });

    it('preserves navDate when parsing v2 manifests, collections, and members', () => {
        const collection = {
            '@type': 'sc:Collection',
            manifests: [
                {
                    '@id': 'http://example.org/manifest/a',
                    label: 'Manifest A',
                    navDate: '1986-01-01T00:00:00Z',
                },
            ],
            collections: [
                {
                    '@id': 'http://example.org/collection/a',
                    label: 'Collection A',
                    navDate: '1987-01-01T00:00:00Z',
                },
            ],
            members: [
                {
                    '@id': 'http://example.org/manifest/b',
                    '@type': 'sc:Manifest',
                    label: 'Manifest B',
                    navDate: '1988-01-01T00:00:00Z',
                },
                {
                    '@id': 'http://example.org/collection/b',
                    '@type': 'sc:Collection',
                    label: 'Collection B',
                    navDate: 123,
                },
            ],
        };

        expect(parseCollection(collection)).toEqual([
            {
                id: 'http://example.org/manifest/a',
                type: 'Manifest',
                label: 'Manifest A',
                thumbnail: undefined,
                navDate: '1986-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/collection/a',
                type: 'Collection',
                label: 'Collection A',
                thumbnail: undefined,
                navDate: '1987-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/manifest/b',
                type: 'Manifest',
                label: 'Manifest B',
                thumbnail: undefined,
                navDate: '1988-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/collection/b',
                type: 'Collection',
                label: 'Collection B',
                thumbnail: undefined,
                navDate: undefined,
            },
        ]);
    });

    it('sorts items chronologically and places undated items last', () => {
        const items = parseCollection(collectionV3WithNavDates);

        expect(sortCollectionItems(items).map((item) => item.id)).toEqual([
            'http://example.org/manifest/1986',
            'http://example.org/manifest/1987',
            'http://example.org/collection/subcollection',
            'http://example.org/manifest/undated',
        ]);
    });

    it('uses label and id as deterministic fallback sort keys', () => {
        const items: CollectionItem[] = [
            {
                id: 'http://example.org/manifest/b',
                type: 'Manifest',
                label: 'Same Label',
                navDate: '1986-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/manifest/a',
                type: 'Manifest',
                label: 'Same Label',
                navDate: '1986-01-01T00:00:00Z',
            },
            {
                id: 'http://example.org/manifest/c',
                type: 'Manifest',
                label: 'Z Label',
                navDate: '1986-01-01T00:00:00Z',
            },
        ];

        expect(sortCollectionItems(items).map((item) => item.id)).toEqual([
            'http://example.org/manifest/a',
            'http://example.org/manifest/b',
            'http://example.org/manifest/c',
        ]);
    });
});
