import { describe, expect, it } from 'vitest';

import { resolveThumbnailResourceSrc } from './getThumbnailSrc';

describe('resolveThumbnailResourceSrc', () => {
    it('prefers a IIIF Image Service URL for manifest thumbnails', () => {
        const thumbnail = [
            {
                id: 'https://iiif.example.org/image/full/max/0/default.jpg',
                type: 'Image',
                service: [
                    {
                        id: 'https://iiif.example.org/image',
                        type: 'ImageService3',
                        profile: 'level1',
                    },
                ],
            },
        ];

        expect(resolveThumbnailResourceSrc(thumbnail)).toBe(
            'https://iiif.example.org/image/full/200,/0/default.jpg',
        );
    });

    it('falls back to the declared thumbnail id for level 0 services', () => {
        const thumbnail = {
            id: 'https://iiif.example.org/image/full/max/0/default.jpg',
            type: 'Image',
            service: [
                {
                    id: 'https://iiif.example.org/image',
                    type: 'ImageService3',
                    profile: 'level0',
                },
            ],
        };

        expect(resolveThumbnailResourceSrc(thumbnail)).toBe(
            'https://iiif.example.org/image/full/max/0/default.jpg',
        );
    });

    it('normalizes service ids that include info.json', () => {
        const thumbnail = {
            id: 'https://iiif.example.org/image/full/max/0/default.jpg',
            type: 'Image',
            service: [
                {
                    '@id': 'https://iiif.example.org/image/info.json',
                    profile: 'http://iiif.io/api/image/2/level1.json',
                },
            ],
        };

        expect(resolveThumbnailResourceSrc(thumbnail, 120)).toBe(
            'https://iiif.example.org/image/full/120,/0/default.jpg',
        );
    });
});
