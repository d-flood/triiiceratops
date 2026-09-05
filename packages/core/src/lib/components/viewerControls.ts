import { getCanvasId } from '../utils/iiifIds';
import { getCanvasBehaviors, getCanvasChoices } from '../utils/iiifParsing';

export type ChoiceGroup = {
    canvasId: string;
    choices: any[];
    selectedChoiceId: string | undefined;
    side: 'left' | 'right';
};

export type VisibleCanvasEntry = {
    canvasId: string;
    canvas: any;
};

export type PagedCanvasGroup = {
    startIndex: number;
    endIndex: number;
    entries: VisibleCanvasEntry[];
};

export type CanvasNavDirection = 'previous' | 'next';

export type CanvasNavIcon = 'left' | 'right' | 'up' | 'down';

export type CanvasNavLayout = {
    leftButton: CanvasNavDirection;
    rightButton: CanvasNavDirection;
    leftIcon: CanvasNavIcon;
    rightIcon: CanvasNavIcon;
};

/** Row-centre difference still read as one row, absorbing subpixel layout noise. */
export const SAME_ROW_EPSILON_PX = 1;

/**
 * Whether to draw the divider between two adjacent groups of the control bar.
 *
 * One rule, applied per boundary: a divider is shown when both groups sit on
 * the same row, because a vertical rule between groups on different rows reads
 * as noise rather than as a separator. Rows are compared by the groups' vertical
 * CENTRES, not their tops: the bar centres its items, so groups of unequal
 * height (the toolbar buttons are shorter than the nav buttons) share a row
 * centre while their tops differ.
 *
 * `null` means the group is not rendered at all, and a boundary with only one
 * side has nothing to divide.
 */
export function shouldShowGroupDivider(
    beforeCentre: number | null,
    afterCentre: number | null,
): boolean {
    return (
        beforeCentre !== null &&
        afterCentre !== null &&
        Math.abs(beforeCentre - afterCentre) <= SAME_ROW_EPSILON_PX
    );
}

/**
 * How long the control bar waits, with nothing happening, before it hides
 * itself over a claimed canvas.
 *
 * Three seconds is a feel decision, not a derived one: long enough that it does
 * not snatch the chrome away from a reader who paused mid-reach, short enough
 * that a reader settling in to watch is not looking at a bar over the caption
 * cues for the first act.
 */
export const IDLE_CHROME_DELAY_MS = 3000;

/**
 * Whether the control bar may hide itself right now.
 *
 * Not four special cases but one rule stated four ways: chrome a reader is
 * *using* is not idle. Playback stopped, a pointer resting on the bar, keyboard
 * focus inside it, or a popover it owns left open each mean the reader's
 * attention is on the chrome rather than through it.
 *
 * Two of these are absolute, and a viewer that broke either would be worse than
 * one that never hid anything: never hide while paused, and never hide while
 * the bar holds KEYBOARD focus — which is what the second rule protects, since
 * its whole point is that keyboard focus must never land on something
 * invisible. Focus a mouse reader left on the play button by clicking it is not
 * that, and treating it as such would pin the chrome open for the whole of
 * every recording started from the bar, which is every recording.
 */
export function canIdleHide(conditions: {
    playing: boolean;
    pointerInBar: boolean;
    keyboardFocusInBar: boolean;
    popoverOpen: boolean;
}): boolean {
    return (
        conditions.playing &&
        !conditions.pointerInBar &&
        !conditions.keyboardFocusInBar &&
        !conditions.popoverOpen
    );
}

export function shouldUseAbbreviatedChoiceLabels(
    viewingMode: ViewingMode,
    visibleChoiceGroups: ChoiceGroup[],
) {
    return viewingMode === 'paged' && visibleChoiceGroups.length > 1;
}

export function getCanvasNavLayout(
    viewingDirection: ViewingDirection,
): CanvasNavLayout {
    if (viewingDirection === 'right-to-left') {
        return {
            leftButton: 'next',
            rightButton: 'previous',
            leftIcon: 'left',
            rightIcon: 'right',
        };
    }

    if (viewingDirection === 'top-to-bottom') {
        return {
            leftButton: 'previous',
            rightButton: 'next',
            leftIcon: 'up',
            rightIcon: 'down',
        };
    }

    if (viewingDirection === 'bottom-to-top') {
        return {
            leftButton: 'next',
            rightButton: 'previous',
            leftIcon: 'up',
            rightIcon: 'down',
        };
    }

    return {
        leftButton: 'previous',
        rightButton: 'next',
        leftIcon: 'left',
        rightIcon: 'right',
    };
}

type ViewingMode = 'individuals' | 'paged' | 'continuous';
type ViewingDirection =
    | 'left-to-right'
    | 'right-to-left'
    | 'top-to-bottom'
    | 'bottom-to-top';

type VisibleChoiceGroupArgs = {
    canvases: any[];
    currentCanvasId: string | null;
    currentCanvasIndex: number;
    viewingMode: ViewingMode;
    pagedOffset: number;
    viewingDirection: ViewingDirection;
    getSelectedChoice: (canvasId: string) => string | undefined;
};

export { getCanvasId };

function isSinglePageCanvas(canvas: any): boolean {
    const behaviors = getCanvasBehaviors(canvas);
    return (
        behaviors.includes('non-paged') || behaviors.includes('facing-pages')
    );
}

export function getPagedCanvasGroups(
    canvases: any[],
    pagedOffset: number,
): PagedCanvasGroup[] {
    const groups: PagedCanvasGroup[] = [];

    for (
        let index = 0;
        index < Math.min(pagedOffset, canvases.length);
        index++
    ) {
        const canvas = canvases[index];
        const canvasId = getCanvasId(canvas);

        groups.push({
            startIndex: index,
            endIndex: index,
            entries: canvasId ? [{ canvasId, canvas }] : [],
        });
    }

    for (let index = pagedOffset; index < canvases.length; ) {
        const firstCanvas = canvases[index];
        const firstCanvasId = getCanvasId(firstCanvas);
        const nextCanvas = canvases[index + 1];
        const nextCanvasId = getCanvasId(nextCanvas);
        const shouldPair =
            !!nextCanvas &&
            !!firstCanvasId &&
            !!nextCanvasId &&
            !isSinglePageCanvas(firstCanvas) &&
            !isSinglePageCanvas(nextCanvas);

        groups.push({
            startIndex: index,
            endIndex: shouldPair ? index + 1 : index,
            entries: [
                ...(firstCanvasId
                    ? [{ canvasId: firstCanvasId, canvas: firstCanvas }]
                    : []),
                ...(shouldPair
                    ? [{ canvasId: nextCanvasId, canvas: nextCanvas }]
                    : []),
            ],
        });

        index += shouldPair ? 2 : 1;
    }

    return groups;
}

export function getVisibleCanvasEntries({
    canvases,
    currentCanvasId,
    currentCanvasIndex,
    viewingMode,
    pagedOffset,
}: Omit<
    VisibleChoiceGroupArgs,
    'viewingDirection' | 'getSelectedChoice'
>): VisibleCanvasEntry[] {
    if (!currentCanvasId) return [];
    if (currentCanvasIndex < 0 || currentCanvasIndex >= canvases.length)
        return [];

    const visibleCanvases: VisibleCanvasEntry[] = [];
    const currentCanvas = canvases[currentCanvasIndex];

    if (!currentCanvas) return visibleCanvases;

    if (viewingMode !== 'paged') {
        visibleCanvases.push({
            canvasId: currentCanvasId,
            canvas: currentCanvas,
        });
        return visibleCanvases;
    }

    const group = getPagedCanvasGroups(canvases, pagedOffset).find(
        ({ startIndex, endIndex }) =>
            currentCanvasIndex >= startIndex && currentCanvasIndex <= endIndex,
    );

    return group?.entries ?? visibleCanvases;
}

export function getVisibleChoiceGroups({
    canvases,
    currentCanvasId,
    currentCanvasIndex,
    viewingMode,
    pagedOffset,
    viewingDirection,
    getSelectedChoice,
}: VisibleChoiceGroupArgs): ChoiceGroup[] {
    const visibleCanvases = getVisibleCanvasEntries({
        canvases,
        currentCanvasId,
        currentCanvasIndex,
        viewingMode,
        pagedOffset,
    });

    if (!visibleCanvases.length) return [];

    const isPagedRTL =
        viewingMode === 'paged' && viewingDirection === 'right-to-left';
    const sideByCanvasId: Record<string, 'left' | 'right'> = {};

    if (viewingMode === 'paged' && visibleCanvases.length === 2) {
        const [first, second] = visibleCanvases;
        sideByCanvasId[first.canvasId] = isPagedRTL ? 'right' : 'left';
        sideByCanvasId[second.canvasId] = isPagedRTL ? 'left' : 'right';
    } else {
        sideByCanvasId[visibleCanvases[0].canvasId] = isPagedRTL
            ? 'right'
            : 'left';
    }

    return visibleCanvases
        .map(({ canvasId, canvas }) => {
            const choices = getCanvasChoices(canvas);
            if (!choices.length) return null;

            return {
                canvasId,
                choices,
                selectedChoiceId: getSelectedChoice(canvasId),
                side: sideByCanvasId[canvasId] ?? 'left',
            } satisfies ChoiceGroup;
        })
        .filter((group): group is ChoiceGroup => group !== null);
}
