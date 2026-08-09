import { describe, expect, it } from 'vitest';

import { segmentHighlights } from './highlightSegments';

describe('segmentHighlights', () => {
    it('returns a single unhighlighted segment when there are no marks', () => {
        expect(segmentHighlights('a plain excerpt')).toEqual([
            { text: 'a plain excerpt', highlighted: false },
        ]);
    });

    it('returns nothing for the empty string', () => {
        expect(segmentHighlights('')).toEqual([]);
    });

    it('recognises a literal <mark>', () => {
        expect(segmentHighlights('before <mark>hit</mark> after')).toEqual([
            { text: 'before ', highlighted: false },
            { text: 'hit', highlighted: true },
            { text: ' after', highlighted: false },
        ]);
    });

    it('recognises an entity-encoded &lt;mark&gt;', () => {
        expect(
            segmentHighlights('before &lt;mark&gt;hit&lt;/mark&gt; after'),
        ).toEqual([
            { text: 'before ', highlighted: false },
            { text: 'hit', highlighted: true },
            { text: ' after', highlighted: false },
        ]);
    });

    it('recognises several marks in one string, in either encoding', () => {
        expect(
            segmentHighlights(
                '<mark>one</mark> and &lt;mark&gt;two&lt;/mark&gt; end',
            ),
        ).toEqual([
            { text: 'one', highlighted: true },
            { text: ' and ', highlighted: false },
            { text: 'two', highlighted: true },
            { text: ' end', highlighted: false },
        ]);
    });

    it('highlights to the end of the string when a mark is never closed', () => {
        expect(segmentHighlights('before <mark>hit and the rest')).toEqual([
            { text: 'before ', highlighted: false },
            { text: 'hit and the rest', highlighted: true },
        ]);
    });

    it('emits no empty segments', () => {
        expect(segmentHighlights('<mark>hit</mark>')).toEqual([
            { text: 'hit', highlighted: true },
        ]);
    });

    it('leaves every other byte alone, including other markup', () => {
        expect(
            segmentHighlights('<script>alert(1)</script> and <b>x</b>'),
        ).toEqual([
            {
                text: '<script>alert(1)</script> and <b>x</b>',
                highlighted: false,
            },
        ]);
    });

    it('does not nest: any close ends the highlight', () => {
        expect(segmentHighlights('<mark>a<mark>b</mark>c</mark>d')).toEqual([
            { text: 'a', highlighted: true },
            { text: 'b', highlighted: true },
            { text: 'c', highlighted: false },
            { text: 'd', highlighted: false },
        ]);
    });

    describe('entity decoding', () => {
        it('decodes an ampersand a service escaped alongside its marks', () => {
            expect(
                segmentHighlights('AT&amp;T &lt;mark&gt;hit&lt;/mark&gt;'),
            ).toEqual([
                { text: 'AT&T ', highlighted: false },
                { text: 'hit', highlighted: true },
            ]);
        });

        it('decodes an escaped less-than back to a readable character', () => {
            expect(segmentHighlights('1 &lt; 2')).toEqual([
                { text: '1 < 2', highlighted: false },
            ]);
        });

        it('decodes quotes and apostrophes', () => {
            expect(
                segmentHighlights('&quot;quoted&quot; &#39;too&#39;'),
            ).toEqual([{ text: '"quoted" \'too\'', highlighted: false }]);
        });

        it('decodes inside a highlighted run too', () => {
            expect(
                segmentHighlights('<mark>AT&amp;T &lt; all</mark> rest'),
            ).toEqual([
                { text: 'AT&T < all', highlighted: true },
                { text: ' rest', highlighted: false },
            ]);
        });

        it('takes exactly one level off, so a doubly-escaped mark stays text', () => {
            expect(segmentHighlights('&amp;lt;mark&amp;gt;')).toEqual([
                { text: '&lt;mark&gt;', highlighted: false },
            ]);
        });
    });
});
