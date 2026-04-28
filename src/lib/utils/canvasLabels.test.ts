import { describe, expect, it } from 'vitest';

import { getCanvasLabel } from './canvasLabels';

describe('getCanvasLabel', () => {
    it('prefers Manifesto labels when available', () => {
        const canvas = {
            getLabel: () => [{ value: 'Cover' }],
        };

        expect(getCanvasLabel(canvas, 0)).toBe('Cover');
    });

    it('falls back to raw IIIF labels', () => {
        const canvas = {
            label: {
                en: ['Page 2'],
            },
        };

        expect(getCanvasLabel(canvas, 1)).toBe('Page 2');
    });

    it('falls back to a generated canvas label when no label is present', () => {
        expect(getCanvasLabel({}, 2)).toBe('Canvas 3');
    });

    it('uses an untitled fallback when no index is available', () => {
        expect(getCanvasLabel({})).toBe('Untitled canvas');
    });
});
