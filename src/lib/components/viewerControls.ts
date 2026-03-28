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

export function shouldUseAbbreviatedChoiceLabels(
    viewingMode: ViewingMode,
    visibleChoiceGroups: ChoiceGroup[],
) {
    return viewingMode === 'paged' && visibleChoiceGroups.length > 1;
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

export function getCanvasId(canvas: any): string | null {
    return (
        canvas?.id ||
        canvas?.['@id'] ||
        canvas?.getCanvasId?.() ||
        canvas?.getId?.() ||
        null
    );
}

export function getCanvasChoices(canvas: any) {
    if (!canvas) return [];

    let images = canvas.getImages?.() || [];
    if ((!images || !images.length) && canvas.getContent) {
        images = canvas.getContent();
    }

    if (!images || !images.length) return [];

    for (const paintingAnno of images) {
        if (!paintingAnno) continue;

        const body = paintingAnno.getBody
            ? paintingAnno.getBody()
            : paintingAnno.body || paintingAnno.resource;

        const rawBody = paintingAnno.__jsonld?.body || paintingAnno.body;
        const isChoice =
            rawBody?.type === 'Choice' ||
            rawBody?.type === 'oa:Choice' ||
            (body &&
                !Array.isArray(body) &&
                (body.type === 'Choice' || body.type === 'oa:Choice'));

        if (!isChoice) continue;

        if (Array.isArray(body)) {
            return body;
        }

        if (body && (body.items || body.item)) {
            return body.items || body.item;
        }

        if (rawBody && (rawBody.items || rawBody.item)) {
            return rawBody.items || rawBody.item;
        }
    }

    return [];
}

export function getVisibleCanvasEntries({
    canvases,
    currentCanvasId,
    currentCanvasIndex,
    viewingMode,
    pagedOffset,
}: Omit<VisibleChoiceGroupArgs, 'viewingDirection' | 'getSelectedChoice'>):
    VisibleCanvasEntry[] {
    if (!currentCanvasId) return [];
    if (currentCanvasIndex < 0 || currentCanvasIndex >= canvases.length) return [];

    const visibleCanvases: VisibleCanvasEntry[] = [];
    const currentCanvas = canvases[currentCanvasIndex];

    if (!currentCanvas) return visibleCanvases;

    if (viewingMode !== 'paged' || currentCanvasIndex < pagedOffset) {
        visibleCanvases.push({
            canvasId: currentCanvasId,
            canvas: currentCanvas,
        });
        return visibleCanvases;
    }

    const pairPosition = (currentCanvasIndex - pagedOffset) % 2;
    const spreadStartIndex =
        pairPosition === 0 ? currentCanvasIndex : currentCanvasIndex - 1;

    const firstCanvas = canvases[spreadStartIndex];
    const firstCanvasId = getCanvasId(firstCanvas);

    if (!firstCanvas || !firstCanvasId) return visibleCanvases;

    visibleCanvases.push({
        canvasId: firstCanvasId,
        canvas: firstCanvas,
    });

    const secondCanvas = canvases[spreadStartIndex + 1];
    const secondCanvasId = getCanvasId(secondCanvas);

    if (secondCanvas && secondCanvasId) {
        visibleCanvases.push({
            canvasId: secondCanvasId,
            canvas: secondCanvas,
        });
    }

    return visibleCanvases;
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

    const isPagedRTL = viewingMode === 'paged' && viewingDirection === 'right-to-left';
    const sideByCanvasId: Record<string, 'left' | 'right'> = {};

    if (viewingMode === 'paged' && visibleCanvases.length === 2) {
        const [first, second] = visibleCanvases;
        sideByCanvasId[first.canvasId] = isPagedRTL ? 'right' : 'left';
        sideByCanvasId[second.canvasId] = isPagedRTL ? 'left' : 'right';
    } else {
        sideByCanvasId[visibleCanvases[0].canvasId] = isPagedRTL ? 'right' : 'left';
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
