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

export type CanvasNavDirection = 'previous' | 'next';

export type CanvasNavLayout = {
    leftButton: CanvasNavDirection;
    rightButton: CanvasNavDirection;
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
        };
    }

    return {
        leftButton: 'previous',
        rightButton: 'next',
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

export function getCanvasBehaviors(canvas: any): string[] {
    const raw =
        canvas?.behavior ||
        canvas?.__jsonld?.behavior ||
        (typeof canvas?.getBehavior === 'function' ? canvas.getBehavior() : []);

    if (!raw) return [];
    const behaviors = Array.isArray(raw) ? raw : [raw];
    return behaviors.map((value) => String(value));
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

    const currentBehaviors = getCanvasBehaviors(currentCanvas);
    const forceSinglePage =
        currentBehaviors.includes('non-paged') ||
        currentBehaviors.includes('facing-pages');

    if (
        viewingMode !== 'paged' ||
        currentCanvasIndex < pagedOffset ||
        forceSinglePage
    ) {
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
    const secondBehaviors = getCanvasBehaviors(secondCanvas);

    if (
        secondCanvas &&
        secondCanvasId &&
        !secondBehaviors.includes('non-paged') &&
        !secondBehaviors.includes('facing-pages')
    ) {
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
