import { getVisibleCanvasEntries } from '../components/viewerControls';

export type TileSource = string | { type: 'image'; url: string };

type ResolveCanvasImageOptions = {
    getSelectedChoice?: (canvasId: string) => string | undefined;
};

type GetViewerTileSourcesParams = {
    canvases: any[];
    currentCanvasIndex: number;
    currentCanvasId: string | null;
    viewingMode: 'individuals' | 'paged' | 'continuous';
    pagedOffset: number;
    getSelectedChoice?: (canvasId: string) => string | undefined;
};

export type ResolvedCanvasImage = {
    canvasId: string;
    annotation: any;
    resource: any;
    resourceId: string | null;
    resourceWidth: number | null;
    resourceHeight: number | null;
    serviceId: string | null;
    serviceProfile: string | null;
};

function getId(thing: any): string | null {
    return (
        thing?.id ||
        thing?.['@id'] ||
        thing?.__jsonld?.id ||
        thing?.__jsonld?.['@id'] ||
        null
    );
}

function normalizeServiceId(serviceId: string): string {
    return serviceId.endsWith('/info.json')
        ? serviceId.slice(0, -'/info.json'.length)
        : serviceId;
}

function getNumericDimension(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

function getResourceDimensions(resource: any): {
    width: number | null;
    height: number | null;
} {
    const resourceJson = resource?.__jsonld || resource;

    return {
        width:
            getNumericDimension(resource?.width) ||
            getNumericDimension(resourceJson?.width) ||
            (typeof resource?.getWidth === 'function'
                ? getNumericDimension(resource.getWidth())
                : null),
        height:
            getNumericDimension(resource?.height) ||
            getNumericDimension(resourceJson?.height) ||
            (typeof resource?.getHeight === 'function'
                ? getNumericDimension(resource.getHeight())
                : null),
    };
}

function isChoiceBody(body: any, rawBody: any): boolean {
    return (
        rawBody?.type === 'Choice' ||
        rawBody?.type === 'oa:Choice' ||
        (!!body &&
            !Array.isArray(body) &&
            (body.type === 'Choice' || body.type === 'oa:Choice'))
    );
}

function getChoiceItems(body: any, rawBody: any): any[] {
    if (rawBody && (rawBody.items || rawBody.item)) {
        return rawBody.items || rawBody.item;
    }

    if (Array.isArray(body)) {
        return body;
    }

    if (body && (body.items || body.item)) {
        return body.items || body.item;
    }

    return [];
}

function getSelectedChoiceResource({
    body,
    rawBody,
    canvasId,
    getSelectedChoice,
}: {
    body: any;
    rawBody: any;
    canvasId: string;
    getSelectedChoice?: (canvasId: string) => string | undefined;
}): any | null {
    const bodyItems = Array.isArray(body) ? body : getChoiceItems(body, null);
    const rawItems = getChoiceItems(null, rawBody);
    const selectedId = getSelectedChoice?.(canvasId);

    if (selectedId) {
        const selectedBodyItem = bodyItems.find(
            (item: any) => getId(item) === selectedId,
        );
        if (selectedBodyItem) {
            return selectedBodyItem;
        }

        const selectedRawIndex = rawItems.findIndex(
            (item: any) => getId(item) === selectedId,
        );
        if (selectedRawIndex >= 0) {
            return bodyItems[selectedRawIndex] || rawItems[selectedRawIndex];
        }
    }

    return bodyItems[0] || rawItems[0] || null;
}

function getCanvasAnnotations(canvas: any): any[] {
    let annotations = canvas.getImages?.() || [];
    if ((!annotations || !annotations.length) && canvas.getContent) {
        annotations = canvas.getContent();
    }
    return annotations || [];
}

function hasResourceContent(resource: any): boolean {
    const resourceJson = resource?.__jsonld || resource;
    return !!(
        resource &&
        (resource.id ||
            resource['@id'] ||
            resourceJson?.service ||
            resourceJson?.id ||
            resourceJson?.['@id'])
    );
}

function getAnnotationResource(
    annotation: any,
    canvasId: string,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): any | null {
    let resource = annotation.getResource ? annotation.getResource() : null;

    if (!resource && annotation.getBody) {
        const body = annotation.getBody();
        const rawBody = annotation.__jsonld?.body || annotation.body;

        if (isChoiceBody(body, rawBody)) {
            resource = getSelectedChoiceResource({
                body,
                rawBody,
                canvasId,
                getSelectedChoice,
            });
        } else if (Array.isArray(body) && body.length > 0) {
            resource = body[0];
        } else if (body) {
            resource = body;
        }
    }

    if (resource && !hasResourceContent(resource)) {
        resource = null;
    }

    if (!resource) {
        const json = annotation.__jsonld || annotation;
        if (json.body) {
            let body = json.body;
            if (body.type === 'Choice' || body.type === 'oa:Choice') {
                const items = body.items || body.item || [];
                const selectedId = getSelectedChoice?.(canvasId);
                const selectedItem = selectedId
                    ? items.find((item: any) => getId(item) === selectedId)
                    : null;
                body = selectedItem || items[0] || null;
            }
            resource = Array.isArray(body) ? body[0] : body;
        }
    }

    return resource;
}

function isIiifImageProfile(profile: unknown): boolean {
    if (typeof profile === 'string') {
        return (
            /^https?:\/\/iiif\.io\/api\/image\//.test(profile) ||
            profile === 'level0' ||
            profile === 'level1' ||
            profile === 'level2'
        );
    }

    if (Array.isArray(profile)) {
        return profile.some((item) => isIiifImageProfile(item));
    }

    return false;
}

function normalizeProfile(profile: unknown): string | null {
    if (typeof profile === 'string') {
        return profile || null;
    }

    if (Array.isArray(profile)) {
        const firstString = profile.find(
            (item): item is string => typeof item === 'string',
        );
        return firstString || null;
    }

    return null;
}

function getImageService(resource: any): any | null {
    let services: any[] = [];
    const resourceJson = resource?.__jsonld || resource;

    if (resourceJson?.service) {
        services = Array.isArray(resourceJson.service)
            ? resourceJson.service
            : [resourceJson.service];
    }

    if (!services.length && resource?.getServices) {
        services = resource.getServices();
    }

    if (!services.length) {
        return null;
    }

    return (
        services.find((item: any) => {
            const type = item.getType
                ? item.getType()
                : item.type || item['@type'] || '';
            const profile = item.getProfile
                ? item.getProfile()
                : item.profile || '';

            return (
                type === 'ImageService1' ||
                type === 'ImageService2' ||
                type === 'ImageService3' ||
                isIiifImageProfile(profile)
            );
        }) || null
    );
}

function getImageServiceDetails(resource: any): {
    serviceId: string | null;
    serviceProfile: string | null;
} {
    const service = getImageService(resource);
    const serviceId = getId(service);
    const rawProfile = service
        ? service.getProfile
            ? service.getProfile()
            : service.profile || ''
        : null;

    return {
        serviceId: serviceId ? normalizeServiceId(serviceId) : null,
        serviceProfile: normalizeProfile(rawProfile),
    };
}

function getHeuristicServiceId(resourceId: string | null): string | null {
    if (!resourceId || !resourceId.includes('/iiif/')) {
        return null;
    }

    const parts = resourceId.split('/');
    const regionIndex = parts.findIndex(
        (part: string) => part === 'full' || /^\d+,\d+,\d+,\d+$/.test(part),
    );

    return regionIndex > 0 ? parts.slice(0, regionIndex).join('/') : null;
}

export function getCanvasLabel(canvas: any, fallbackIndex?: number): string {
    const fallback =
        fallbackIndex === undefined
            ? 'Untitled canvas'
            : `Canvas ${fallbackIndex + 1}`;

    try {
        const label = canvas.getLabel?.();
        if (Array.isArray(label) && label.length > 0) {
            return label[0]?.value || fallback;
        }
    } catch {
        // ignore malformed labels
    }

    const rawLabel = canvas.label || canvas.__jsonld?.label;
    if (typeof rawLabel === 'string') {
        return rawLabel;
    }

    const localizedLabel = rawLabel?.none || rawLabel?.en;
    if (Array.isArray(localizedLabel) && localizedLabel.length > 0) {
        return localizedLabel[0];
    }

    return fallback;
}

export function getCanvasId(canvas: any): string {
    return getId(canvas) || canvas?.getCanvasId?.() || canvas?.getId?.() || '';
}

export function resolveCanvasImage(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): ResolvedCanvasImage | null {
    const canvasId = getCanvasId(canvas);
    if (!canvasId) {
        return null;
    }

    const annotations = getCanvasAnnotations(canvas);
    if (!annotations.length) {
        return null;
    }

    const annotation = annotations[0];
    const resource = getAnnotationResource(
        annotation,
        canvasId,
        options.getSelectedChoice,
    );

    if (!resource) {
        return null;
    }

    const resourceId = getId(resource);
    const resourceDimensions = getResourceDimensions(resource);
    const serviceDetails = getImageServiceDetails(resource);
    const serviceId =
        serviceDetails.serviceId || getHeuristicServiceId(resourceId);

    return {
        canvasId,
        annotation,
        resource,
        resourceId,
        resourceWidth: resourceDimensions.width,
        resourceHeight: resourceDimensions.height,
        serviceId,
        serviceProfile: serviceDetails.serviceProfile,
    };
}

export function getCanvasTileSource(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): TileSource | null {
    const resolved = resolveCanvasImage(canvas, options);
    if (!resolved) {
        return null;
    }

    if (resolved.serviceId) {
        return `${resolved.serviceId}/info.json`;
    }

    if (resolved.resourceId) {
        return { type: 'image', url: resolved.resourceId };
    }

    return null;
}

export function buildIiifImageRequestUrl(
    serviceId: string,
    options: {
        width?: number;
        height?: number;
        quality?: string;
        format?: string;
    } = {
        width: 1600,
    },
): string {
    const base = normalizeServiceId(serviceId);
    const quality = options.quality || 'default';
    const format = options.format || 'jpg';
    const width =
        typeof options.width === 'number'
            ? Math.max(1, Math.round(options.width))
            : null;
    const height =
        typeof options.height === 'number'
            ? Math.max(1, Math.round(options.height))
            : null;
    const size = width ? `${width},` : `,${height || 1600}`;

    return `${base}/full/${size}/0/${quality}.${format}`;
}

export function getViewerTileSources({
    canvases,
    currentCanvasIndex,
    currentCanvasId,
    viewingMode,
    pagedOffset,
    getSelectedChoice,
}: GetViewerTileSourcesParams): TileSource[] | null {
    if (
        !canvases.length ||
        currentCanvasIndex < 0 ||
        !canvases[currentCanvasIndex]
    ) {
        return null;
    }

    let visibleCanvases = [canvases[currentCanvasIndex]];

    if (viewingMode === 'continuous') {
        visibleCanvases = canvases;
    } else if (viewingMode === 'paged') {
        visibleCanvases = getVisibleCanvasEntries({
            canvases,
            currentCanvasId,
            currentCanvasIndex,
            viewingMode,
            pagedOffset,
        }).map(({ canvas }) => canvas);
    }

    const tileSources = visibleCanvases
        .map((canvas) => getCanvasTileSource(canvas, { getSelectedChoice }))
        .filter((source): source is TileSource => source !== null);

    return tileSources.length ? tileSources : null;
}
