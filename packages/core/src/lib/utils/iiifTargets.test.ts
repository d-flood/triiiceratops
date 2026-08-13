import { describe, expect, it } from 'vitest';

import { parseIiifSelectorTime, parseIiifTime } from './iiifTargets';

describe('parseIiifTime (temporal media fragments)', () => {
    it('parses a whole start,end interval', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=157,203')).toEqual(
            {
                seconds: 157,
                endSeconds: 203,
            },
        );
    });

    it('parses a start-only fragment', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=157')).toEqual({
            seconds: 157,
        });
    });

    it('parses an end-only fragment as starting at zero', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=,203')).toEqual({
            seconds: 0,
            endSeconds: 203,
        });
    });

    it('parses fractional seconds', () => {
        expect(
            parseIiifTime('https://example.org/canvas/1#t=302.05,3971.24'),
        ).toEqual({ seconds: 302.05, endSeconds: 3971.24 });
    });

    it('parses a start of zero', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=0')).toEqual({
            seconds: 0,
        });
    });

    it('carries an end before the start unvalidated', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=5,3')).toEqual({
            seconds: 5,
            endSeconds: 3,
        });
    });

    it('ignores an npt: prefix on either bound', () => {
        expect(
            parseIiifTime('https://example.org/canvas/1#t=npt:12,30'),
        ).toEqual({
            seconds: 12,
            endSeconds: 30,
        });
        expect(
            parseIiifTime('https://example.org/canvas/1#t=10,npt:20'),
        ).toEqual({
            seconds: 10,
            endSeconds: 20,
        });
        expect(
            parseIiifTime('https://example.org/canvas/1#t=npt:10,npt:20'),
        ).toEqual({
            seconds: 10,
            endSeconds: 20,
        });
    });

    it('returns null for the npt: hh:mm:ss spelling rather than a wrong value', () => {
        expect(
            parseIiifTime('https://example.org/canvas/1#t=00:02:37'),
        ).toBeNull();
        expect(
            parseIiifTime(
                'https://example.org/canvas/1#t=npt:00:02:37,00:03:23',
            ),
        ).toBeNull();
    });

    it('returns null for negative seconds', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=-5')).toBeNull();
        expect(
            parseIiifTime('https://example.org/canvas/1#t=-5,-3'),
        ).toBeNull();
    });

    it('reads a t= fragment beside an xywh= one', () => {
        expect(
            parseIiifTime(
                'https://example.org/canvas/1#xywh=10,20,30,40&t=5,6',
            ),
        ).toEqual({ seconds: 5, endSeconds: 6 });
    });

    it('returns null for targets with no temporal fragment', () => {
        expect(parseIiifTime('https://example.org/canvas/1')).toBeNull();
        expect(
            parseIiifTime('https://example.org/canvas/1#xywh=10,20,30,40'),
        ).toBeNull();
        expect(parseIiifTime('')).toBeNull();
    });

    it('returns null for a malformed temporal fragment', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=')).toBeNull();
        expect(
            parseIiifTime('https://example.org/canvas/1#t=start'),
        ).toBeNull();
        expect(parseIiifTime('https://example.org/canvas/1#t=.')).toBeNull();
    });

    it('returns null for a garbage end bound rather than seeking to zero', () => {
        expect(parseIiifTime('https://example.org/canvas/1#t=,..')).toBeNull();
        expect(parseIiifTime('https://example.org/canvas/1#t=,.')).toBeNull();
        expect(
            parseIiifTime('https://example.org/canvas/1#t=,1.2.3'),
        ).toBeNull();
    });

    it('does not read a t= that lives in the query string', () => {
        expect(
            parseIiifTime('https://example.org/canvas/1?start=157'),
        ).toBeNull();
        expect(parseIiifTime('https://example.org/canvas/1?t=157')).toBeNull();
        expect(
            parseIiifTime('https://example.org/canvas/1?foo=1&t=157'),
        ).toBeNull();
    });

    it('reads a t= from the fragment of a URI that also has a query string', () => {
        expect(
            parseIiifTime('https://example.org/canvas/1?foo=1#t=157'),
        ).toEqual({ seconds: 157 });
    });
});

describe('parseIiifSelectorTime', () => {
    it('reads a PointSelector t', () => {
        expect(
            parseIiifSelectorTime({ type: 'PointSelector', t: 120.5 }),
        ).toEqual({ seconds: 120.5 });
    });

    it('reads a point at zero', () => {
        expect(parseIiifSelectorTime({ type: 'PointSelector', t: 0 })).toEqual({
            seconds: 0,
        });
    });

    it('reads a FragmentSelector value', () => {
        expect(
            parseIiifSelectorTime({
                type: 'FragmentSelector',
                conformsTo: 'http://www.w3.org/TR/media-frags/',
                value: 't=157,203',
            }),
        ).toEqual({ seconds: 157, endSeconds: 203 });
    });

    it('returns null for selectors with no time', () => {
        expect(parseIiifSelectorTime(null)).toBeNull();
        expect(parseIiifSelectorTime(undefined)).toBeNull();
        expect(parseIiifSelectorTime('t=157')).toBeNull();
        expect(
            parseIiifSelectorTime({
                type: 'FragmentSelector',
                value: 'xywh=1,2,3,4',
            }),
        ).toBeNull();
        expect(
            parseIiifSelectorTime({ type: 'PointSelector', x: 10, y: 20 }),
        ).toBeNull();
        expect(
            parseIiifSelectorTime({ type: 'PointSelector', t: 'abc' }),
        ).toBeNull();
    });
});
