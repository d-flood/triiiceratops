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
});
