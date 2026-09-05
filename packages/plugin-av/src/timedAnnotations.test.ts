/**
 * The timed-annotation LINKAGE contract: which manifest annotation on a canvas
 * gets a row in the panel's notes list, and what that row says.
 *
 * Anchored on the real cookbook recipe rather than on invented shapes — 0103 is
 * the manifest the rule exists for, and the one that proved the feature was
 * missing.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { timedAnnotationsFor } from './timedAnnotations';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const CANVAS = 'https://example.org/canvas/1';

/** 0103's own annotations, exactly as `getAnnotations` would hand them over. */
const COOKBOOK_0103: unknown[] = (() => {
    const manifest = JSON.parse(
        readFileSync(
            resolve(
                REPO,
                'packages/core/src/lib/test/fixtures/manifests/av/0103-poetry-reading-annotations.json',
            ),
            'utf8',
        ),
    ) as { items: { annotations: { items: unknown[] }[] }[] };
    return manifest.items[0].annotations.flatMap((page) => page.items);
})();

/** An annotation in 0103's spelling, with the parts under test overridden. */
function annotation(overrides: Record<string, unknown>): unknown {
    return {
        type: 'Annotation',
        motivation: ['commenting'],
        id: `${CANVAS}/page1/anno`,
        body: [{ type: 'TextualBody', value: 'A note', format: 'text/plain' }],
        target: `${CANVAS}#t=1,2`,
        ...overrides,
    };
}

describe('timed annotation linkage', () => {
    it('adopts cookbook 0103: a commenting annotation on a time span', () => {
        expect(timedAnnotationsFor(COOKBOOK_0103)).toEqual([
            {
                id: 'https://iiif.io/api/cookbook/recipe/0103-poetry-reading-annotations/canvas/1/page1/anno2',
                startSeconds: 702,
                endSeconds: 705,
                text: 'Soft laughter, rustling',
            },
        ]);
    });

    it('lists a target that names only a start, with no end at all', () => {
        const [entry] = timedAnnotationsFor([
            annotation({ target: `${CANVAS}#t=12` }),
        ]);
        expect(entry.startSeconds).toBe(12);
        expect('endSeconds' in entry).toBe(false);
    });

    it('ignores an annotation whose target carries no time', () => {
        expect(timedAnnotationsFor([annotation({ target: CANVAS })])).toEqual(
            [],
        );
        expect(
            timedAnnotationsFor([
                annotation({ target: `${CANVAS}#xywh=1,2,3,4` }),
            ]),
        ).toEqual([]);
    });

    /*
        The whole reason core's parser is reused rather than copied: a `t=` in a
        QUERY string is not a media fragment, and a second parser is exactly
        where that distinction goes quietly wrong.
    */
    it('never reads a query-string t= as a media fragment', () => {
        expect(
            timedAnnotationsFor([annotation({ target: `${CANVAS}?t=157` })]),
        ).toEqual([]);
    });

    it('ignores a target that is not a plain string', () => {
        expect(
            timedAnnotationsFor([
                annotation({
                    target: {
                        type: 'SpecificResource',
                        source: CANVAS,
                        selector: { type: 'FragmentSelector', value: 't=1,2' },
                    },
                }),
            ]),
        ).toEqual([]);
    });

    it('reads the first plain-text body and a body that declares no format', () => {
        expect(
            timedAnnotationsFor([
                annotation({
                    body: { type: 'TextualBody', value: 'Bare object body' },
                }),
            ])[0].text,
        ).toBe('Bare object body');
    });

    /*
        The documented fence: a body this chunk cannot render is skipped rather
        than guessed at, so no unsanitized manifest string reaches the DOM.
    */
    it('skips an HTML body rather than rendering markup it cannot sanitize', () => {
        expect(
            timedAnnotationsFor([
                annotation({
                    body: {
                        type: 'TextualBody',
                        format: 'text/html',
                        value: '<script>alert(1)</script>',
                    },
                }),
            ]),
        ).toEqual([]);
    });

    it('skips a non-textual body and takes the plain text beside it', () => {
        expect(
            timedAnnotationsFor([
                annotation({
                    body: [
                        {
                            type: 'Image',
                            id: '/thumb.png',
                            format: 'image/png',
                        },
                        {
                            type: 'TextualBody',
                            value: 'The caption for it',
                            format: 'text/plain',
                        },
                    ],
                }),
            ])[0].text,
        ).toBe('The caption for it');
    });

    it('ignores an annotation with a time but nothing to read', () => {
        expect(
            timedAnnotationsFor([
                annotation({ body: { type: 'Image', id: '/thumb.png' } }),
            ]),
        ).toEqual([]);
    });

    /*
        Painting annotations never reach here — `getAnnotations` returns
        `annotations`/`otherContent` only — so `motivation` is not inspected in
        either of the two shapes a publisher may write it.
    */
    it('lists a note whatever shape its motivation was authored in', () => {
        expect(
            timedAnnotationsFor([
                annotation({ motivation: 'commenting' }),
                annotation({ motivation: ['commenting', 'tagging'] }),
                annotation({ motivation: undefined }),
            ]),
        ).toHaveLength(3);
    });

    it('orders by start, leaving manifest order to win a tie', () => {
        expect(
            timedAnnotationsFor([
                annotation({ target: `${CANVAS}#t=30`, body: text('third') }),
                annotation({ target: `${CANVAS}#t=10`, body: text('first') }),
                annotation({ target: `${CANVAS}#t=30`, body: text('fourth') }),
                annotation({ target: `${CANVAS}#t=20`, body: text('second') }),
            ]).map((entry) => entry.text),
        ).toEqual(['first', 'second', 'third', 'fourth']);
    });

    it('falls back to a positional id when the annotation declares none', () => {
        const entries = timedAnnotationsFor([
            annotation({ id: undefined, target: `${CANVAS}#t=5` }),
            annotation({ id: undefined, target: `${CANVAS}#t=6` }),
        ]);
        expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
    });

    it('finds nothing on a canvas with no annotations, so the panel offers none', () => {
        expect(timedAnnotationsFor([])).toEqual([]);
    });
});

function text(value: string): unknown {
    return { type: 'TextualBody', value, format: 'text/plain' };
}
