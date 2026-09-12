import { describe, expect, it } from 'vitest';

import {
    FEATURE_PARAM,
    featureSearch,
    parseFeatureIndex,
} from '$lib/featureSelection';

const TOTAL = 5;

describe('the feature selection', () => {
    it('opens on the first feature with no parameter', () => {
        expect(parseFeatureIndex('', TOTAL)).toBe(0);
        expect(parseFeatureIndex('?other=2', TOTAL)).toBe(0);
    });

    it('reads a one-based parameter', () => {
        expect(parseFeatureIndex('?feature=1', TOTAL)).toBe(0);
        expect(parseFeatureIndex('?feature=2', TOTAL)).toBe(1);
        expect(parseFeatureIndex('?feature=5', TOTAL)).toBe(4);
    });

    it('falls back to the first feature rather than to nothing', () => {
        for (const search of [
            '?feature=0',
            '?feature=6',
            '?feature=-2',
            '?feature=two',
            '?feature=',
            '?feature=2.5',
        ]) {
            expect(parseFeatureIndex(search, TOTAL), search).toBe(0);
        }
    });

    it('writes the parameter the rail reads', () => {
        expect(featureSearch(0)).toBe(`?${FEATURE_PARAM}=1`);
        expect(featureSearch(4)).toBe(`?${FEATURE_PARAM}=5`);
    });

    it('round-trips', () => {
        for (let at = 0; at < TOTAL; at += 1) {
            expect(parseFeatureIndex(featureSearch(at), TOTAL)).toBe(at);
        }
    });
});
