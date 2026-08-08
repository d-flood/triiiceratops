import { getVisibleCanvasEntries } from '../components/viewerControls';
import { getCanvasLabel } from './canvasLabels';
import { getCanvasId, getResourceId } from './iiifIds';
import {
    getChoiceAlternatives,
    getPaintingAnnotations,
    getPaintingBody,
    isChoiceBody,
} from './iiifParsing';
import { normalizeIiifTargets } from './iiifTargets';
import { resolveLanguageValue } from './languageMap';

export type TileSource = string | { type: 'image'; url: string };

export type RegionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type PositionedTileSource = {
    canvasId: string;
    tileSource: TileSource;
    x: number;
    y: number;
    width: number;
};

type ResolveCanvasImageOptions = {
    getSelectedChoice?: (canvasId: string) => string | undefined;
    /**
     * Dimensions to stand in for a Canvas that declares none, instead of
     * refusing to resolve it at all.
     *
     * Opt-in, and deliberately: every caller but one wants a spec-violating
     * canvas dropped, because it has no geometry to place an image or an
     * annotation in. The Canvas2D renderer is the exception — it must still lay
     * such a canvas out, from a median of its siblings, and reflow it if an
     * image service later reports real dimensions (user story 32). It reads the
     * declared dimensions separately, through
     * {@link getDeclaredCanvasDimensions}, so what it gets back here is only
     * ever the source descriptor; the placeholder never reaches layout.
     */
    fallbackCanvasDimensions?: CanvasDimensions;
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
    /** Human-readable label from the annotation body or annotation itself, if present. */
    label: string | null;
    canvasWidth: number;
    canvasHeight: number;
    resourceWidth: number | null;
    resourceHeight: number | null;
    serviceId: string | null;
    serviceProfile: string | null;
    imageApiRegion: RegionRect | null;
    /**
     * The box this image paints on its canvas, in manifest Canvas coordinates
     * normalized by the canvas's *width* on both axes — the vertical axis
     * included, so that one vertical unit equals one horizontal unit. A
     * canvas-filling image is `x: 0, y: 0, width: 1`, making `height` the
     * canvas's aspect ratio; a region-targeted image gets its target's own box.
     * This is the authoritative geometry for laying the image out — the image
     * service's own dimensions describe the pixels, not the placement.
     */
    x: number;
    y: number;
    width: number;
    height: number;
};

type CanvasDimensions = {
    width: number;
    height: number;
};

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
    // `width`/`height` are spelled the same on a IIIF v2 and a v3 image
    // resource, so these two raw reads cover both versions.
    return {
        width: getNumericDimension(resource?.width),
        height: getNumericDimension(resource?.height),
    };
}

function getSpecificResourceSource(resource: any): any | null {
    return resource?.type === 'SpecificResource' && resource?.source
        ? resource.source
        : null;
}

function getCanvasDimensions(canvas: any): CanvasDimensions | null {
    // Raw IIIF Canvas JSON spells these `width`/`height` in both v2 and v3.
    // The trailing `|| null` is what the dead accessor rung evaluated to, and
    // is load-bearing: a canvas declaring `width: 0` must still fall through to
    // "no dimensions" rather than become a valid `0`.
    const width = canvas?.width || null;
    const height = canvas?.height || null;

    if (typeof width !== 'number' || typeof height !== 'number') {
        return null;
    }

    return { width, height };
}

/**
 * The `#xywh=` fragment a painting annotation targets, if it targets one.
 *
 * `target` is the v3 spelling and `on` the v2 one, and both are read here. Only
 * `target` was, which silently dropped the region of every raw v2 composite
 * canvas — an image painting a sub-rectangle of its canvas landed at the origin
 * at full size, on top of its siblings. The renderer spec promises
 * region-targeted canvases (user story 30), so this is fixed rather than
 * recorded as a deviation.
 */
function parseTargetRegion(annotation: any): {
    x: number;
    y: number;
    width: number;
    height: number;
} | null {
    const region = normalizeIiifTargets(
        annotation?.target ?? annotation?.on,
    ).find((target) => target.xywh)?.xywh;

    if (!region) return null;

    return {
        x: region[0],
        y: region[1],
        width: region[2],
        height: region[3],
    };
}

function parseImageApiRegionValue(
    value: unknown,
    resourceDimensions: { width: number | null; height: number | null },
): RegionRect | null {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    const trimmed = value.trim();
    const isPercent = trimmed.startsWith('pct:');
    const raw = isPercent ? trimmed.slice(4) : trimmed;
    const parts = raw.split(',').map((part) => Number(part.trim()));

    if (
        parts.length !== 4 ||
        parts.some((part) => !Number.isFinite(part) || part < 0)
    ) {
        return null;
    }

    if (!isPercent) {
        return {
            x: parts[0],
            y: parts[1],
            width: parts[2],
            height: parts[3],
        };
    }

    if (
        typeof resourceDimensions.width !== 'number' ||
        typeof resourceDimensions.height !== 'number'
    ) {
        return null;
    }

    return {
        x: (parts[0] / 100) * resourceDimensions.width,
        y: (parts[1] / 100) * resourceDimensions.height,
        width: (parts[2] / 100) * resourceDimensions.width,
        height: (parts[3] / 100) * resourceDimensions.height,
    };
}

function parseImageApiSelectorRegion(
    resource: any,
    resourceDimensions: { width: number | null; height: number | null },
): RegionRect | null {
    return parseImageApiRegionValue(
        resource?.selector?.type === 'ImageApiSelector'
            ? resource.selector.region
            : null,
        resourceDimensions,
    );
}

export function getRegionString(region: RegionRect): string {
    return [region.x, region.y, region.width, region.height]
        .map((value) => Math.round(value))
        .join(',');
}

function getAnnotationResource(
    annotation: any,
    canvasId: string,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): any | null {
    let resource: any = null;

    // The raw-JSON path, and now the only one. `getPaintingBody` reads the v2
    // `resource` spelling as well as the v3 `body` one, and
    // `getChoiceAlternatives` recognizes the v2 `oa:Choice`/`default`+`item`
    // spelling as well as v3's `Choice`/`items`, with its array access guarded.
    let body = getPaintingBody(annotation);
    if (body) {
        if (isChoiceBody(body)) {
            const items = getChoiceAlternatives(body);
            const selectedId = getSelectedChoice?.(canvasId);
            const selectedItem = selectedId
                ? items.find((item: any) => getResourceId(item) === selectedId)
                : null;
            body = selectedItem || items[0] || null;
        }
        resource = Array.isArray(body) ? body[0] : body;
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

    if (resource?.service) {
        services = Array.isArray(resource.service)
            ? resource.service
            : [resource.service];
    }

    if (!services.length) {
        return null;
    }

    return (
        services.find((item: any) => {
            // v3 spells the service type `type`, v2 `@type`; `profile` is
            // spelled the same in both.
            const type = item.type || item['@type'] || '';
            const profile = item.profile || '';

            return (
                type === 'ImageService1' ||
                type === 'ImageService2' ||
                type === 'ImageService3' ||
                isIiifImageProfile(profile)
            );
        }) || null
    );
}

function getImageLabel(resource: any, annotation: any): string | null {
    for (const candidate of [resource, annotation]) {
        if (!candidate) continue;

        // `label` is spelled the same in v2 and v3; `resolveLanguageValue`
        // reads the v2 bare string and `[{"@value"}]` array as well as the v3
        // language map.
        const rawLabel = candidate.label;
        if (rawLabel) {
            const resolved = resolveLanguageValue(rawLabel);
            if (resolved) return resolved;
        }
    }

    return null;
}

function getImageServiceDetails(resource: any): {
    serviceId: string | null;
    serviceProfile: string | null;
} {
    const service = getImageService(resource);
    const serviceId = getResourceId(service);
    const rawProfile = service ? service.profile || '' : null;

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

export { getCanvasLabel, getCanvasId };

/**
 * The dimensions a raw Canvas actually declares, or `null` where it declares
 * none usable.
 *
 * Exported so a caller can tell "the manifest says 1200x900" apart from "the
 * manifest says nothing and something guessed for it" — a distinction
 * {@link ResolvedCanvasImage} cannot carry, because its `canvasWidth`/
 * `canvasHeight` are always numbers. The renderer needs it: a declared
 * dimension is authoritative forever, while a missing one is a placeholder to
 * be replaced the moment an image service reports the truth.
 */
export function getDeclaredCanvasDimensions(
    canvas: unknown,
): CanvasDimensions | null {
    return getCanvasDimensions(canvas);
}

export function resolveCanvasImage(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): ResolvedCanvasImage | null {
    const allResolved = resolveAllCanvasImages(canvas, options);
    return allResolved[0] || null;
}

export function resolveAllCanvasImages(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): ResolvedCanvasImage[] {
    const canvasId = getCanvasId(canvas);
    if (!canvasId) {
        return [];
    }

    const canvasDimensions =
        getCanvasDimensions(canvas) ?? options.fallbackCanvasDimensions ?? null;
    if (!canvasDimensions) {
        return [];
    }

    const annotations = getPaintingAnnotations(canvas);
    if (!annotations.length) {
        return [];
    }

    return annotations
        .map((annotation) => {
            const rawResource = getAnnotationResource(
                annotation,
                canvasId,
                options.getSelectedChoice,
            );
            const resource =
                getSpecificResourceSource(rawResource) || rawResource;

            if (!resource) {
                return null;
            }

            const resourceId = getResourceId(resource);
            const resourceDimensions = getResourceDimensions(resource);
            const serviceDetails = getImageServiceDetails(resource);
            const serviceId =
                serviceDetails.serviceId || getHeuristicServiceId(resourceId);
            const region = parseTargetRegion(annotation);
            const imageApiRegion = parseImageApiSelectorRegion(
                rawResource,
                resourceDimensions,
            );

            return {
                canvasId,
                annotation,
                resource,
                resourceId,
                label: getImageLabel(resource, annotation),
                canvasWidth: canvasDimensions.width,
                canvasHeight: canvasDimensions.height,
                resourceWidth:
                    imageApiRegion?.width || resourceDimensions.width,
                resourceHeight:
                    imageApiRegion?.height || resourceDimensions.height,
                serviceId,
                serviceProfile: serviceDetails.serviceProfile,
                imageApiRegion,
                x: region ? region.x / canvasDimensions.width : 0,
                // OSD viewport coordinates normalize BOTH axes to the reference
                // image's width (aspect ratio preserved: 1 vertical unit = 1
                // horizontal unit = the base image width in px). So the y offset
                // is divided by width, exactly like x and width — not by height.
                y: region ? region.y / canvasDimensions.width : 0,
                width: region ? region.width / canvasDimensions.width : 1,
                height: region
                    ? region.height / canvasDimensions.width
                    : canvasDimensions.height / canvasDimensions.width,
            } satisfies ResolvedCanvasImage;
        })
        .filter((result): result is ResolvedCanvasImage => result !== null);
}

export function getCanvasTileSource(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): TileSource | null {
    const resolved = resolveCanvasImage(canvas, options);
    if (!resolved) {
        return null;
    }

    if (resolved.serviceId && resolved.imageApiRegion) {
        return {
            type: 'image',
            url: buildIiifImageRequestUrl(resolved.serviceId, {
                region: getRegionString(resolved.imageApiRegion),
                size: 'max',
            }),
        };
    }

    if (resolved.serviceId) {
        return `${resolved.serviceId}/info.json`;
    }

    if (resolved.resourceId) {
        return { type: 'image', url: resolved.resourceId };
    }

    return null;
}

export function getCanvasTileSources(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): PositionedTileSource[] {
    return resolveAllCanvasImages(canvas, options)
        .map((resolved) => {
            let tileSource: TileSource | null = null;

            if (resolved.serviceId && resolved.imageApiRegion) {
                tileSource = {
                    type: 'image',
                    url: buildIiifImageRequestUrl(resolved.serviceId, {
                        region: getRegionString(resolved.imageApiRegion),
                        size: 'max',
                    }),
                };
            } else if (resolved.serviceId) {
                tileSource = `${resolved.serviceId}/info.json`;
            } else if (resolved.resourceId) {
                tileSource = { type: 'image', url: resolved.resourceId };
            }

            if (!tileSource) {
                return null;
            }

            return {
                canvasId: resolved.canvasId,
                tileSource,
                x: resolved.x,
                y: resolved.y,
                width: resolved.width,
            } satisfies PositionedTileSource;
        })
        .filter((result): result is PositionedTileSource => result !== null);
}

export function buildIiifImageRequestUrl(
    serviceId: string,
    options: {
        region?: string;
        size?: string;
        width?: number;
        height?: number;
        quality?: string;
        format?: string;
    } = {
        width: 1600,
    },
): string {
    const base = normalizeServiceId(serviceId);
    const region = options.region || 'full';
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
    const size = options.size || (width ? `${width},` : `,${height || 1600}`);

    return `${base}/${region}/${size}/0/${quality}.${format}`;
}

export function getViewerTileSources({
    canvases,
    currentCanvasIndex,
    currentCanvasId,
    viewingMode,
    pagedOffset,
    getSelectedChoice,
}: GetViewerTileSourcesParams): PositionedTileSource[] | null {
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

    const tileSources = visibleCanvases.flatMap((canvas) =>
        getCanvasTileSources(canvas, { getSelectedChoice }),
    );

    return tileSources.length ? tileSources : null;
}
