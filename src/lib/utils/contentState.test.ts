import { describe, expect, it } from 'vitest';

import { parseContentState } from './contentState';

describe('contentState', () => {
    it('parses target canvas ids and xywh regions via shared IIIF helpers', () => {
        const payload = {
            id: 'annotation-1',
            type: 'Annotation',
            target: 'https://example.org/canvas/1#xywh=1236,906,104,336',
            partOf: {
                id: 'https://example.org/manifest/1',
            },
        };
        const value = Buffer.from(JSON.stringify(payload), 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');

        expect(parseContentState(value)).toEqual({
            manifestId: 'https://example.org/manifest/1',
            canvasId: 'https://example.org/canvas/1',
            region: {
                x: 1236,
                y: 906,
                width: 104,
                height: 336,
            },
        });
    });
});
