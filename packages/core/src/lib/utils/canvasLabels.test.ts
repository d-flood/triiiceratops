import { describe, expect, it } from 'vitest';

import { getCanvasLabel } from './canvasLabels';

describe('getCanvasLabel', () => {
    it('reads a Manifesto label when there is no raw label', () => {
        const canvas = {
            getLabel: () => [{ value: 'Cover' }],
        };

        expect(getCanvasLabel(canvas, 0)).toBe('Cover');
    });

    it('reads a v2 JSON-LD `@value` label array', () => {
        // The IIIF Presentation 2 spelling, and the shape real manifests use —
        // `vendored/riksarkivetscblarge.json` labels every canvas this way.
        // `manifesto.js` used to parse it into `_value`/`_locale` before this
        // was reached; on raw JSON it arrives verbatim, and reading only
        // `value`/`_value` silently produced "Canvas N" everywhere.
        const canvas = {
            label: [{ '@value': 'Bild 6', '@language': 'sv' }],
        };

        expect(getCanvasLabel(canvas, 5)).toBe('Bild 6');
    });

    it('honors a preferred locale across `@language` entries', () => {
        const canvas = {
            label: [
                { '@value': 'Omslag', '@language': 'sv' },
                { '@value': 'Cover', '@language': 'en' },
            ],
        };

        expect(getCanvasLabel(canvas, 0, 'sv')).toBe('Omslag');
        expect(getCanvasLabel(canvas, 0, 'en')).toBe('Cover');
        // No preference given: `en` wins before falling through to the first.
        expect(getCanvasLabel(canvas, 0)).toBe('Cover');
    });

    it('reads a bare v2 string label', () => {
        expect(getCanvasLabel({ label: 'Page 1' }, 0)).toBe('Page 1');
    });

    it('prefers the raw label over a stale accessor', () => {
        // Raw-first is what keeps this working once `manifesto.js` is gone.
        const canvas = {
            label: 'Raw',
            getLabel: () => [{ value: 'Accessor' }],
        };

        expect(getCanvasLabel(canvas, 0)).toBe('Raw');
    });

    it('is total on a null canvas', () => {
        expect(getCanvasLabel(null, 0)).toBe('Canvas 1');
        expect(getCanvasLabel(undefined)).toBe('Untitled canvas');
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
