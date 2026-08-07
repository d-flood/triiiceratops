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
