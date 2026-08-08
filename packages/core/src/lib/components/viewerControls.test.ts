import { describe, expect, it, vi } from 'vitest';

import { getCanvasBehaviors, getCanvasChoices } from '../utils/iiifParsing';
import {
    getCanvasNavLayout,
    getPagedCanvasGroups,
    getVisibleCanvasEntries,
    getVisibleChoiceGroups,
    shouldUseAbbreviatedChoiceLabels,
} from './viewerControls';

function createChoice(id: string, label: string) {
    return {
        id,
        label: { en: [label] },
    };
}

/** One IIIF v2 painting annotation, wrapped the way a v2 canvas carries it. */
function v2Images(canvasId: string, resource: any) {
    return [
        {
            '@id': `${canvasId}/annotation/1`,
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            on: canvasId,
            resource,
        },
    ];
}

/**
 * A raw IIIF v2 Choice canvas: `oa:Choice` with `default` plus `item`.
 *
 * These doubles used to be `manifesto.js`-shaped — a `getImages()` accessor
 * returning annotations with a `getBody()` that FLATTENED the Choice into a
 * plain `AnnotationBody[]`. Painting-annotation enumeration is first-party for
 * v2 as of `remove-manifesto` ticket 06 and reads `canvas.images[]` directly,
 * so these carry the JSON a v2 publisher actually serves — and with it the v2
 * Choice spelling, which had no reader at all before that ticket.
 */
function createChoiceCanvas(canvasId: string, choiceIds: string[]) {
    const [first, ...rest] = choiceIds.map((choiceId, index) =>
        createChoice(choiceId, `Option ${index + 1}`),
    );

    return {
        '@id': canvasId,
        '@type': 'sc:Canvas',
        width: 800,
        height: 1000,
        images: v2Images(canvasId, {
            '@type': 'oa:Choice',
            default: first,
            item: rest,
        }),
    };
}

function createImageCanvas(canvasId: string) {
    return {
        '@id': canvasId,
        '@type': 'sc:Canvas',
        width: 800,
        height: 1000,
        images: v2Images(canvasId, {
            '@id': `${canvasId}/image`,
            '@type': 'dctypes:Image',
        }),
    };
}

function createBehaviorCanvas(canvasId: string, behavior: string | string[]) {
    return {
        ...createImageCanvas(canvasId),
        behavior,
    };
}

function createMixedCanvas(
    canvasId: string,
    options: { choiceIds: string[]; choiceIndex: number },
) {
    const annotations = [
        ...createImageCanvas(canvasId).images,
        ...createChoiceCanvas(canvasId, options.choiceIds).images,
    ];

    if (options.choiceIndex === 0) {
        annotations.reverse();
    }

    return {
        '@id': canvasId,
        '@type': 'sc:Canvas',
        width: 800,
        height: 1000,
        images: annotations,
    };
}

/**
 * Raw IIIF v3 canvases — plain manifest JSON, no `manifesto.js` accessors.
 *
 * The doubles above are the v2 half of the same thing: `canvas.images[]` with
 * the painting body under `resource`, and a Choice spelled `oa:Choice` with
 * `default` + `item`. This half is `canvas.items[].items[]` with the body under
 * `body`, and a Choice spelled `Choice` with `items` — matching
 * `test/fixtures/manifests/cookbook/0033-choice.json`.
 *
 * Both are now the primary paths: painting-annotation enumeration is
 * first-party for v3 as of `remove-manifesto` ticket 03 and for v2 as of ticket
 * 06, and hands `getCanvasChoices` raw JSON annotations either way.
 */
function createV3ChoiceCanvas(
    canvasId: string,
    choiceIds: string[],
    options: { bodyType?: string; itemsKey?: 'items' | 'item' } = {},
): any {
    const { bodyType = 'Choice', itemsKey = 'items' } = options;
    const choices = choiceIds.map((choiceId, index) =>
        createChoice(choiceId, `Option ${index + 1}`),
    );

    return {
        id: canvasId,
        type: 'Canvas',
        width: 800,
        height: 1000,
        items: [
            {
                id: `${canvasId}/page/1`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation/1`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: canvasId,
                        body: { type: bodyType, [itemsKey]: choices },
                    },
                ],
            },
        ],
    };
}

function createV3ImageCanvas(canvasId: string): any {
    return {
        id: canvasId,
        type: 'Canvas',
        width: 800,
        height: 1000,
        items: [
            {
                id: `${canvasId}/page/1`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation/1`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: canvasId,
                        body: { id: `${canvasId}/image`, type: 'Image' },
                    },
                ],
            },
        ],
    };
}

/** A v3 canvas whose Choice sits on the SECOND annotation page. */
function createV3SplitPageChoiceCanvas(
    canvasId: string,
    choiceIds: string[],
): any {
    const canvas = createV3ImageCanvas(canvasId);
    const choicePage = createV3ChoiceCanvas(canvasId, choiceIds).items[0];
    choicePage.id = `${canvasId}/page/2`;
    canvas.items.push(choicePage);
    return canvas;
}

describe('viewerControls helpers', () => {
    describe('getCanvasChoices', () => {
        it('returns Choice items from the first painting annotation', () => {
            const canvas = createChoiceCanvas('canvas-1', [
                'choice-a',
                'choice-b',
            ]);

            expect(getCanvasChoices(canvas)).toHaveLength(2);
        });

        it('returns an empty array for non-Choice bodies', () => {
            const canvas = createImageCanvas('canvas-1');

            expect(getCanvasChoices(canvas)).toEqual([]);
        });

        it('finds Choice items even when they are not on the first painting annotation', () => {
            const canvas = createMixedCanvas('canvas-1', {
                choiceIds: ['choice-a', 'choice-b'],
                choiceIndex: 1,
            });

            expect(getCanvasChoices(canvas)).toHaveLength(2);
        });

        it('returns the Choice items of a raw IIIF v3 canvas', () => {
            const canvas = createV3ChoiceCanvas('canvas-1', [
                'choice-a',
                'choice-b',
            ]);

            const choices = getCanvasChoices(canvas);

            expect(choices).toHaveLength(2);
            expect(choices.map((choice: any) => choice.id)).toEqual([
                'choice-a',
                'choice-b',
            ]);
            // Identity of the ITEMS, not of the array: the objects handed to
            // the choice UI are the manifest's own, not library wrappers. The
            // array itself is freshly built, because v2 has to concatenate
            // `default` with `item` and because a bare object in place of the
            // array has to be coerced into one.
            const items = canvas.items[0].items[0].body.items;
            expect(choices[0]).toBe(items[0]);
            expect(choices[1]).toBe(items[1]);
        });

        it('accepts the oa:Choice spelling on a raw IIIF v3 body', () => {
            const canvas = createV3ChoiceCanvas(
                'canvas-1',
                ['choice-a', 'choice-b'],
                { bodyType: 'oa:Choice' },
            );

            expect(
                getCanvasChoices(canvas).map((choice: any) => choice.id),
            ).toEqual(['choice-a', 'choice-b']);
        });

        it('accepts the singular item alias on a raw IIIF v3 Choice body', () => {
            const canvas = createV3ChoiceCanvas(
                'canvas-1',
                ['choice-a', 'choice-b'],
                { itemsKey: 'item' },
            );

            expect(
                getCanvasChoices(canvas).map((choice: any) => choice.id),
            ).toEqual(['choice-a', 'choice-b']);
        });

        it('returns an empty array for a raw IIIF v3 canvas with no Choice', () => {
            expect(getCanvasChoices(createV3ImageCanvas('canvas-1'))).toEqual(
                [],
            );
        });

        it('finds a raw IIIF v3 Choice on a later annotation page', () => {
            // `manifesto.js` read only `canvas.items[0]`, so a Choice on the
            // second annotation page was invisible. Enumeration reads every
            // page as of ticket 03; this pins that the choice UI sees it.
            const canvas = createV3SplitPageChoiceCanvas('canvas-1', [
                'choice-a',
                'choice-b',
            ]);

            expect(
                getCanvasChoices(canvas).map((choice: any) => choice.id),
            ).toEqual(['choice-a', 'choice-b']);
        });
    });

    describe('getVisibleChoiceGroups', () => {
        it('uses the previous canvas when the selected canvas is the right page of a spread', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createChoiceCanvas('canvas-2', ['choice-b1']),
                createChoiceCanvas('canvas-3', ['choice-c1']),
                createImageCanvas('canvas-4'),
            ];

            const visibleCanvasIds = getVisibleCanvasEntries({
                canvases,
                currentCanvasId: 'canvas-3',
                currentCanvasIndex: 2,
                viewingMode: 'paged',
                pagedOffset: 1,
            }).map((entry) => entry.canvasId);

            expect(visibleCanvasIds).toEqual(['canvas-2', 'canvas-3']);
        });

        it('keeps non-paged choice controls on the left', () => {
            const canvases = [createChoiceCanvas('canvas-1', ['choice-a'])];

            expect(
                getVisibleChoiceGroups({
                    canvases,
                    currentCanvasId: 'canvas-1',
                    currentCanvasIndex: 0,
                    viewingMode: 'individuals',
                    pagedOffset: 1,
                    viewingDirection: 'left-to-right',
                    getSelectedChoice: () => undefined,
                }),
            ).toEqual([
                expect.objectContaining({
                    canvasId: 'canvas-1',
                    side: 'left',
                }),
            ]);
        });

        it('surfaces the raw IIIF v3 Choice items and honors the selection', () => {
            const getSelectedChoice = vi.fn((canvasId: string) =>
                canvasId === 'canvas-1' ? 'choice-b' : undefined,
            );
            const canvases = [
                createV3ChoiceCanvas('canvas-1', ['choice-a', 'choice-b']),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-1',
                currentCanvasIndex: 0,
                viewingMode: 'individuals',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice,
            });

            expect(getSelectedChoice).toHaveBeenCalledWith('canvas-1');
            expect(groups).toHaveLength(1);
            expect(groups[0].canvasId).toBe('canvas-1');
            expect(groups[0].side).toBe('left');
            expect(groups[0].selectedChoiceId).toBe('choice-b');
            expect(groups[0].choices.map((choice: any) => choice.id)).toEqual([
                'choice-a',
                'choice-b',
            ]);
        });

        it('keeps the current canvas choice group on the left side of the spread', () => {
            const getSelectedChoice = vi.fn(() => undefined);
            const canvases = [
                createImageCanvas('canvas-1'),
                createChoiceCanvas('canvas-2', ['choice-b1', 'choice-b2']),
                createImageCanvas('canvas-3'),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-2',
                currentCanvasIndex: 1,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice,
            });

            expect(groups).toEqual([
                expect.objectContaining({
                    canvasId: 'canvas-2',
                    side: 'left',
                }),
            ]);
            expect(getSelectedChoice).toHaveBeenCalledWith('canvas-2');
        });

        it('renders the right canvas choice group on the right side of a spread', () => {
            const getSelectedChoice = vi.fn((canvasId: string) =>
                canvasId === 'canvas-3' ? 'choice-c2' : undefined,
            );
            const canvases = [
                createImageCanvas('canvas-1'),
                createImageCanvas('canvas-2'),
                createChoiceCanvas('canvas-3', ['choice-c1', 'choice-c2']),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-2',
                currentCanvasIndex: 1,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice,
            });

            expect(groups).toEqual([
                expect.objectContaining({
                    canvasId: 'canvas-3',
                    selectedChoiceId: 'choice-c2',
                    side: 'right',
                }),
            ]);
            expect(getSelectedChoice).toHaveBeenCalledWith('canvas-3');
        });

        it('renders both sides when both canvases in the spread have choices', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createChoiceCanvas('canvas-2', ['choice-b1']),
                createChoiceCanvas('canvas-3', ['choice-c1']),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-2',
                currentCanvasIndex: 1,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            expect(groups.map((group) => [group.canvasId, group.side])).toEqual(
                [
                    ['canvas-2', 'left'],
                    ['canvas-3', 'right'],
                ],
            );
        });

        it('renders both choice groups when the selected canvas is the right page', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createChoiceCanvas('canvas-2', ['choice-b1']),
                createChoiceCanvas('canvas-3', ['choice-c1']),
                createImageCanvas('canvas-4'),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-3',
                currentCanvasIndex: 2,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            expect(groups.map((group) => [group.canvasId, group.side])).toEqual(
                [
                    ['canvas-2', 'left'],
                    ['canvas-3', 'right'],
                ],
            );
        });

        it('renders only the right-side controls when only the right page has choices and it is selected', () => {
            const groups = getVisibleChoiceGroups({
                canvases: [
                    createImageCanvas('canvas-1'),
                    createImageCanvas('canvas-2'),
                    createChoiceCanvas('canvas-3', ['choice-c1', 'choice-c2']),
                    createImageCanvas('canvas-4'),
                ],
                currentCanvasId: 'canvas-3',
                currentCanvasIndex: 2,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            expect(groups).toEqual([
                expect.objectContaining({
                    canvasId: 'canvas-3',
                    side: 'right',
                }),
            ]);
        });

        it('keeps the leading single page unpaired in paged mode', () => {
            const canvases = [
                createChoiceCanvas('canvas-1', ['choice-a']),
                createChoiceCanvas('canvas-2', ['choice-b']),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-1',
                currentCanvasIndex: 0,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            expect(groups).toEqual([
                expect.objectContaining({
                    canvasId: 'canvas-1',
                    side: 'left',
                }),
            ]);
        });

        it('keeps the final unpaired page as a single choice group', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createImageCanvas('canvas-2'),
                createChoiceCanvas('canvas-3', ['choice-c1']),
                createChoiceCanvas('canvas-4', ['choice-d1']),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-4',
                currentCanvasIndex: 3,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            expect(groups).toEqual([
                expect.objectContaining({
                    canvasId: 'canvas-4',
                    side: 'left',
                }),
            ]);
        });

        it('mirrors spread sides in RTL paged mode', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createChoiceCanvas('canvas-2', ['choice-b1']),
                createChoiceCanvas('canvas-3', ['choice-c1']),
            ];

            const groups = getVisibleChoiceGroups({
                canvases,
                currentCanvasId: 'canvas-2',
                currentCanvasIndex: 1,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'right-to-left',
                getSelectedChoice: () => undefined,
            });

            expect(groups.map((group) => [group.canvasId, group.side])).toEqual(
                [
                    ['canvas-2', 'right'],
                    ['canvas-3', 'left'],
                ],
            );
        });

        it('uses abbreviated labels only when both paged sides have choices', () => {
            const pagedGroups = getVisibleChoiceGroups({
                canvases: [
                    createImageCanvas('canvas-1'),
                    createChoiceCanvas('canvas-2', ['choice-b1']),
                    createChoiceCanvas('canvas-3', ['choice-c1']),
                ],
                currentCanvasId: 'canvas-2',
                currentCanvasIndex: 1,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            const singleGroup = getVisibleChoiceGroups({
                canvases: [
                    createImageCanvas('canvas-1'),
                    createChoiceCanvas('canvas-2', ['choice-b1']),
                    createImageCanvas('canvas-3'),
                ],
                currentCanvasId: 'canvas-2',
                currentCanvasIndex: 1,
                viewingMode: 'paged',
                pagedOffset: 1,
                viewingDirection: 'left-to-right',
                getSelectedChoice: () => undefined,
            });

            expect(shouldUseAbbreviatedChoiceLabels('paged', pagedGroups)).toBe(
                true,
            );
            expect(shouldUseAbbreviatedChoiceLabels('paged', singleGroup)).toBe(
                false,
            );
            expect(
                shouldUseAbbreviatedChoiceLabels('individuals', pagedGroups),
            ).toBe(false);
        });
    });

    describe('getCanvasBehaviors', () => {
        it('reads the IIIF v3 `behavior` spelling, as a string or a list', () => {
            expect(getCanvasBehaviors({ behavior: 'non-paged' })).toEqual([
                'non-paged',
            ]);
            expect(
                getCanvasBehaviors({ behavior: ['facing-pages', 'hidden'] }),
            ).toEqual(['facing-pages', 'hidden']);
            expect(
                getCanvasBehaviors({
                    behavior: 'http://iiif.io/api/presentation/2#non-paged',
                }),
            ).toEqual(['non-paged']);
        });

        it('reads the IIIF v2 `viewingHint` spelling too', () => {
            // Raw v2 Canvas JSON, which is what the manifest cache holds. Left
            // unread, `isSinglePageCanvas` never fired for a v2 manifest and a
            // canvas the publisher marked as standing alone was paired into a
            // spread with its neighbour — which then shifted every spread after
            // it.
            expect(getCanvasBehaviors({ viewingHint: 'non-paged' })).toEqual([
                'non-paged',
            ]);
            expect(
                getCanvasBehaviors({
                    '@type': 'sc:Canvas',
                    viewingHint:
                        'http://iiif.io/api/presentation/2#facing-pages',
                }),
            ).toEqual(['facing-pages']);
            expect(getCanvasBehaviors({ viewingHint: ['non-paged'] })).toEqual([
                'non-paged',
            ]);
        });

        it('prefers the v3 spelling when a document carries both', () => {
            expect(
                getCanvasBehaviors({
                    behavior: 'facing-pages',
                    viewingHint: 'non-paged',
                }),
            ).toEqual(['facing-pages']);
        });

        it('is total', () => {
            expect(getCanvasBehaviors(null)).toEqual([]);
            expect(getCanvasBehaviors({})).toEqual([]);
        });
    });

    describe('paged canvas grouping', () => {
        it('treats non-paged canvases as their own spread', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createBehaviorCanvas('canvas-2', 'non-paged'),
                createImageCanvas('canvas-3'),
                createImageCanvas('canvas-4'),
            ];

            expect(
                getPagedCanvasGroups(canvases, 1).map((group) =>
                    group.entries.map((entry) => entry.canvasId),
                ),
            ).toEqual([['canvas-1'], ['canvas-2'], ['canvas-3', 'canvas-4']]);
        });

        it('does not pair a v2 canvas that declares `viewingHint: non-paged`', () => {
            // Raw IIIF v2 Canvas JSON end to end — the shape the manifest cache
            // actually holds. Before the v2 spelling was read, `canvas-2` was
            // paired with `canvas-3` and every spread after it was off by one.
            const canvases = [
                createImageCanvas('canvas-1'),
                {
                    ...createImageCanvas('canvas-2'),
                    viewingHint: 'non-paged',
                },
                createImageCanvas('canvas-3'),
                createImageCanvas('canvas-4'),
            ];

            expect(
                getPagedCanvasGroups(canvases, 1).map((group) =>
                    group.entries.map((entry) => entry.canvasId),
                ),
            ).toEqual([['canvas-1'], ['canvas-2'], ['canvas-3', 'canvas-4']]);
        });

        it('does not pair a v2 canvas that declares `viewingHint: facing-pages`', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                {
                    ...createImageCanvas('canvas-2'),
                    viewingHint: 'facing-pages',
                },
                createImageCanvas('canvas-3'),
            ];

            expect(
                getPagedCanvasGroups(canvases, 0).map((group) =>
                    group.entries.map((entry) => entry.canvasId),
                ),
            ).toEqual([['canvas-1'], ['canvas-2'], ['canvas-3']]);
        });

        it('shows only the non-paged canvas when it is selected in paged mode', () => {
            const canvases = [
                createImageCanvas('canvas-1'),
                createBehaviorCanvas('canvas-2', 'non-paged'),
                createImageCanvas('canvas-3'),
                createImageCanvas('canvas-4'),
            ];

            expect(
                getVisibleCanvasEntries({
                    canvases,
                    currentCanvasId: 'canvas-2',
                    currentCanvasIndex: 1,
                    viewingMode: 'paged',
                    pagedOffset: 1,
                }).map((entry) => entry.canvasId),
            ).toEqual(['canvas-2']);
        });
    });

    describe('getCanvasNavLayout', () => {
        it('keeps left previous and right next in LTR', () => {
            expect(getCanvasNavLayout('left-to-right')).toEqual({
                leftButton: 'previous',
                rightButton: 'next',
                leftIcon: 'left',
                rightIcon: 'right',
            });
        });

        it('mirrors visual nav buttons in RTL', () => {
            expect(getCanvasNavLayout('right-to-left')).toEqual({
                leftButton: 'next',
                rightButton: 'previous',
                leftIcon: 'left',
                rightIcon: 'right',
            });
        });

        it('uses up and down icons for top-to-bottom navigation', () => {
            expect(getCanvasNavLayout('top-to-bottom')).toEqual({
                leftButton: 'previous',
                rightButton: 'next',
                leftIcon: 'up',
                rightIcon: 'down',
            });
        });

        it('reverses actions while keeping up/down icons in bottom-to-top', () => {
            expect(getCanvasNavLayout('bottom-to-top')).toEqual({
                leftButton: 'next',
                rightButton: 'previous',
                leftIcon: 'up',
                rightIcon: 'down',
            });
        });
    });
});
