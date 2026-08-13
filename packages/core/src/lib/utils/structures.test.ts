import { describe, expect, it } from 'vitest';

import {
    getSequenceNodeIndexById,
    isStructureNodeActive,
    parseStructures,
} from './structures';

describe('structures helpers', () => {
    it('preserves sequence behavior on parsed v3 ranges', () => {
        const nodes = parseStructures({
            structures: [
                {
                    id: 'range-sequence',
                    type: 'Range',
                    behavior: ['sequence'],
                    label: { en: ['Physical sequence'] },
                    items: [],
                },
            ],
        });

        expect(nodes).toEqual([
            expect.objectContaining({
                id: 'range-sequence',
                behaviors: ['sequence'],
            }),
        ]);
    });

    it('indexes only top-level sequence ranges', () => {
        const nodes = parseStructures({
            structures: [
                {
                    id: 'range-toc',
                    type: 'Range',
                    label: { en: ['Table of Contents'] },
                    items: [],
                },
                {
                    id: 'range-sequence-a',
                    type: 'Range',
                    behavior: ['sequence'],
                    label: { en: ['Physical sequence'] },
                    items: [],
                },
                {
                    id: 'range-sequence-b',
                    type: 'Range',
                    behavior: ['sequence'],
                    label: { en: ['Author-intended sequence'] },
                    items: [],
                },
            ],
        });

        expect(getSequenceNodeIndexById(nodes, 'range-toc')).toBeUndefined();
        expect(getSequenceNodeIndexById(nodes, 'range-sequence-a')).toBe(0);
        expect(getSequenceNodeIndexById(nodes, 'range-sequence-b')).toBe(1);
    });

    it('treats direct canvas membership as active for non-sequence ranges', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-chapter-1',
                    type: 'Range',
                    label: { en: ['Chapter 1'] },
                    items: [{ id: 'canvas-1', type: 'Canvas' }],
                },
            ],
        });

        expect(isStructureNodeActive(node, 'canvas-1')).toBe(true);
        expect(isStructureNodeActive(node, 'canvas-2')).toBe(false);
    });

    it('resolves v2 structure labels from plain strings', () => {
        const [node] = parseStructures({
            structures: [
                {
                    '@id': 'range-1',
                    '@type': 'sc:Range',
                    label: 'Chapter 1',
                    canvases: ['canvas-1'],
                },
            ],
        });

        expect(node.label).toBe('Chapter 1');
    });

    it('resolves v2 structure labels from @value objects', () => {
        const [node] = parseStructures({
            structures: [
                {
                    '@id': 'range-1',
                    '@type': 'sc:Range',
                    label: {
                        '@language': 'ar',
                        '@value': 'فصل',
                    },
                    canvases: ['canvas-1'],
                },
            ],
        });

        expect(node.label).toBe('فصل');
    });

    it('resolves v2 structure labels from @value arrays', () => {
        const [node] = parseStructures({
            structures: [
                {
                    '@id': 'range-1',
                    '@type': 'sc:Range',
                    label: {
                        '@language': 'en',
                        '@value': ['Chapter 1', 'Chapter One'],
                    },
                    canvases: ['canvas-1'],
                },
            ],
        });

        expect(node.label).toBe('Chapter 1');
    });
});

describe('structure temporal offsets', () => {
    it('carries a v3 range item`s `#t=` fragment beside the stripped canvas id', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-1',
                    type: 'Range',
                    label: { en: ['Atto Primo'] },
                    items: [
                        {
                            type: 'Canvas',
                            id: 'https://example.org/canvas/1#t=0,302.05',
                        },
                        {
                            type: 'Canvas',
                            id: 'https://example.org/canvas/1#t=302.05',
                        },
                        { type: 'Canvas', id: 'https://example.org/canvas/2' },
                    ],
                },
            ],
        });

        expect(node.canvasIds).toEqual([
            'https://example.org/canvas/1',
            'https://example.org/canvas/1',
            'https://example.org/canvas/2',
        ]);
        expect(node.canvasTimes).toEqual([
            { seconds: 0, endSeconds: 302.05 },
            { seconds: 302.05 },
            null,
        ]);
    });

    it('carries a `#t=` fragment from a v3 range item given as a bare string', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-1',
                    type: 'Range',
                    items: ['https://example.org/canvas/1#t=12'],
                },
            ],
        });

        expect(node.canvasIds).toEqual(['https://example.org/canvas/1']);
        expect(node.canvasTimes).toEqual([{ seconds: 12 }]);
    });

    it('carries `#t=` fragments from v2 `canvases` and `members`', () => {
        const [canvasesNode] = parseStructures({
            structures: [
                {
                    '@id': 'range-1',
                    '@type': 'sc:Range',
                    canvases: ['https://example.org/canvas/1#t=5,9'],
                },
            ],
        });
        const [membersNode] = parseStructures({
            structures: [
                {
                    '@id': 'range-2',
                    '@type': 'sc:Range',
                    members: [
                        {
                            '@id': 'https://example.org/canvas/1#t=9,12',
                            '@type': 'sc:Canvas',
                        },
                    ],
                },
            ],
        });

        expect(canvasesNode.canvasIds).toEqual([
            'https://example.org/canvas/1',
        ]);
        expect(canvasesNode.canvasTimes).toEqual([
            { seconds: 5, endSeconds: 9 },
        ]);
        expect(membersNode.canvasTimes).toEqual([
            { seconds: 9, endSeconds: 12 },
        ]);
    });
});
