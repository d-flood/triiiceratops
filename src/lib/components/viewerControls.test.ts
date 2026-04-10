import { describe, expect, it, vi } from 'vitest';

import {
    getCanvasNavLayout,
    getCanvasChoices,
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

function createChoiceCanvas(canvasId: string, choiceIds: string[]) {
    const choices = choiceIds.map((choiceId, index) =>
        createChoice(choiceId, `Option ${index + 1}`),
    );

    return {
        id: canvasId,
        getImages: () => [
            {
                getBody: () => choices,
                __jsonld: {
                    body: {
                        type: 'Choice',
                        items: choices,
                    },
                },
            },
        ],
    };
}

function createImageCanvas(canvasId: string) {
    return {
        id: canvasId,
        getImages: () => [
            {
                getBody: () => ({
                    id: `${canvasId}/image`,
                    type: 'Image',
                }),
                __jsonld: {
                    body: {
                        id: `${canvasId}/image`,
                        type: 'Image',
                    },
                },
            },
        ],
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
    const choices = options.choiceIds.map((choiceId, index) =>
        createChoice(choiceId, `Option ${index + 1}`),
    );

    const annotations = [
        {
            getBody: () => ({
                id: `${canvasId}/image`,
                type: 'Image',
            }),
            __jsonld: {
                body: {
                    id: `${canvasId}/image`,
                    type: 'Image',
                },
            },
        },
        {
            getBody: () => choices,
            __jsonld: {
                body: {
                    type: 'Choice',
                    items: choices,
                },
            },
        },
    ];

    if (options.choiceIndex === 0) {
        annotations.reverse();
    }

    return {
        id: canvasId,
        getImages: () => annotations,
    };
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
