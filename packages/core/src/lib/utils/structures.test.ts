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

describe('structure canvas regions', () => {
    /** The two spellings of the same target: 0025's, and the general one. */
    const REGION = { x: 553, y: 1157, width: 470, height: 1103 };

    it('carries a `SpecificResource` item`s region beside the canvas it names', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-articles',
                    type: 'Range',
                    label: { de: ['Tagesneuigkeiten'] },
                    items: [
                        {
                            type: 'SpecificResource',
                            source: {
                                id: 'https://example.org/canvas/p2',
                                type: 'Canvas',
                            },
                            selector: {
                                type: 'FragmentSelector',
                                value: 'xywh=553,1157,470,1103',
                            },
                        },
                        {
                            type: 'Canvas',
                            id: 'https://example.org/canvas/p3',
                        },
                    ],
                },
            ],
        });

        expect(node.label).toBe('Tagesneuigkeiten');
        expect(node.canvasIds).toEqual([
            'https://example.org/canvas/p2',
            'https://example.org/canvas/p3',
        ]);
        expect(node.canvasRegions).toEqual([REGION, null]);
        expect(node.canvasTimes).toEqual([null, null]);
    });

    it('carries a region from a `SpecificResource` whose source is a bare id', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-articles',
                    type: 'Range',
                    items: [
                        {
                            type: 'SpecificResource',
                            source: 'https://example.org/canvas/p2',
                            selector: {
                                type: 'FragmentSelector',
                                value: 'xywh=553,1157,470,1103',
                            },
                        },
                    ],
                },
            ],
        });

        expect(node.canvasIds).toEqual(['https://example.org/canvas/p2']);
        expect(node.canvasRegions).toEqual([REGION]);
    });

    it('resolves a `#xywh=` string target to the same node', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-articles',
                    type: 'Range',
                    items: [
                        'https://example.org/canvas/p2#xywh=553,1157,470,1103',
                    ],
                },
            ],
        });

        expect(node.canvasIds).toEqual(['https://example.org/canvas/p2']);
        expect(node.canvasRegions).toEqual([REGION]);
    });

    it('keeps a region and a `#t=` time on the same target', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-1',
                    type: 'Range',
                    items: [
                        'https://example.org/canvas/1#xywh=10,20,30,40&t=5,9',
                    ],
                },
            ],
        });

        expect(node.canvasIds).toEqual(['https://example.org/canvas/1']);
        expect(node.canvasRegions).toEqual([
            { x: 10, y: 20, width: 30, height: 40 },
        ]);
        expect(node.canvasTimes).toEqual([{ seconds: 5, endSeconds: 9 }]);
    });

    it('holds the index alignment of `canvasIds` on every range shape', () => {
        const nodes = parseStructures({
            structures: [
                {
                    id: 'range-mixed',
                    type: 'Range',
                    items: [
                        {
                            type: 'SpecificResource',
                            source: {
                                id: 'https://example.org/canvas/p2',
                                type: 'Canvas',
                            },
                            selector: {
                                type: 'FragmentSelector',
                                value: 'xywh=1,2,3,4',
                            },
                        },
                        { type: 'Canvas', id: 'https://example.org/canvas/p2' },
                        'https://example.org/canvas/p3#t=4',
                    ],
                },
                {
                    '@id': 'range-v2',
                    '@type': 'sc:Range',
                    canvases: ['https://example.org/canvas/p1'],
                },
            ],
        });

        for (const node of nodes) {
            expect(node.canvasRegions).toHaveLength(node.canvasIds.length);
            expect(node.canvasTimes).toHaveLength(node.canvasIds.length);
        }
        expect(nodes[0].canvasRegions).toEqual([
            { x: 1, y: 2, width: 3, height: 4 },
            null,
            null,
        ]);
    });

    it('drops a `SpecificResource` whose source names no canvas', () => {
        const [node] = parseStructures({
            structures: [
                {
                    id: 'range-1',
                    type: 'Range',
                    items: [
                        {
                            type: 'SpecificResource',
                            selector: {
                                type: 'FragmentSelector',
                                value: 'xywh=1,2,3,4',
                            },
                        },
                    ],
                },
            ],
        });

        expect(node.canvasIds).toEqual([]);
        expect(node.canvasRegions).toEqual([]);
    });
});
