/**
 * The playground's drop seam. `apps/demo` has no Playwright harness and jsdom
 * implements neither `DataTransfer` nor `DragEvent`, so the handler is tested
 * where it is a function of a payload rather than of an event.
 */

import { describe, expect, it } from 'vitest';
import type { DropPayloadSource } from '@triiiceratops/config';

import { resolveDroppedView } from './drop';

const MANIFEST =
    'https://iiif.io/api/cookbook/recipe/0599-drag-and-drop/manifest.json';
const CANVAS = `${MANIFEST.replace('/manifest.json', '')}/canvas/p1`;

function plain(text: string): DropPayloadSource {
    return {
        types: ['text/plain'],
        getData: (type: string) => (type === 'text/plain' ? text : ''),
    };
}

function uriList(text: string): DropPayloadSource {
    return {
        types: ['text/uri-list'],
        getData: (type: string) => (type === 'text/uri-list' ? text : ''),
    };
}

function contentStateDocument(fragment = ''): string {
    return JSON.stringify({
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        type: 'Annotation',
        motivation: 'contentState',
        target: {
            id: `${CANVAS}${fragment}`,
            type: 'Canvas',
            partOf: [{ id: MANIFEST, type: 'Manifest' }],
        },
    });
}

describe('resolveDroppedView', () => {
    it('resolves a bare manifest URL', () => {
        expect(resolveDroppedView(uriList(MANIFEST))).toEqual({
            manifestId: MANIFEST,
        });
    });

    it('resolves recipe 0599’s stringified content-state document', () => {
        expect(resolveDroppedView(plain(contentStateDocument()))).toEqual({
            manifestId: MANIFEST,
            canvasId: CANVAS,
        });
    });

    it('resolves a link whose query carries iiif-content, region and all', () => {
        const encoded = btoa(contentStateDocument('#xywh=10,20,30,40'))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        const link = `https://example.org/demo/?iiif-content=${encodeURIComponent(encoded)}`;

        expect(resolveDroppedView(uriList(link))).toEqual({
            manifestId: MANIFEST,
            canvasId: CANVAS,
            region: { x: 10, y: 20, width: 30, height: 40 },
        });
    });

    it('resolves nothing from plain text that is not a content state', () => {
        expect(resolveDroppedView(plain('just some words'))).toBeNull();
        expect(resolveDroppedView(plain(''))).toBeNull();
        expect(resolveDroppedView(null)).toBeNull();
    });
});
