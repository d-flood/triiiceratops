import { describe, expect, it } from 'vitest';
import { DEFAULT_POINT_RADIUS, resolvePointRadius } from './pointMarker';

describe('resolvePointRadius', () => {
    it('honors a configured positive radius', () => {
        expect(resolvePointRadius({ radius: 8 })).toBe(8);
    });

    it('falls back to the default when unset', () => {
        expect(resolvePointRadius()).toBe(DEFAULT_POINT_RADIUS);
        expect(resolvePointRadius(null)).toBe(DEFAULT_POINT_RADIUS);
        expect(resolvePointRadius({})).toBe(DEFAULT_POINT_RADIUS);
    });

    it('rejects non-positive or non-finite radii', () => {
        expect(resolvePointRadius({ radius: 0 })).toBe(DEFAULT_POINT_RADIUS);
        expect(resolvePointRadius({ radius: -4 })).toBe(DEFAULT_POINT_RADIUS);
        expect(resolvePointRadius({ radius: Number.NaN })).toBe(
            DEFAULT_POINT_RADIUS,
        );
    });
});
