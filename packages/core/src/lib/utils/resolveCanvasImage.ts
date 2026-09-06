import { getVisibleCanvasEntries } from '../components/viewerControls';
import { getCanvasLabel } from './canvasLabels';
import { getCanvasId, getResourceId } from './iiifIds';
import { iiifImageRequestUrl, normalizeServiceId } from './iiifImageRequest';
import { getPaintingAnnotations } from './iiifParsing';
import {
    findImageBody,
    getImageService,
    unwrapSpecificResource,
} from './paintingBodies';
import { normalizeIiifTargets } from './iiifTargets';
import { resolveLanguageValue } from './languageMap';

/**
 * Where a canvas's pixels come from.
 *
 * `static` is one known URL. `service` is an image service the consumer resolves
 * once its `info.json` has been fetched — into a tile pyramid when it advertises
 * tiles, and otherwise into a fixed-size ladder. Which of the two a service is
 * comes from what it advertises, not from its declared `profile`, which is
 * carried here only for the consumers that report it.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export type ImageSource =
    | { kind: 'static'; url: string }
    | { kind: 'service'; serviceId: string; profile: string | null };

export type RegionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
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
     * image service later reports real dimensions. It reads the
     * declared dimensions separately, through
     * {@link getDeclaredCanvasDimensions}, so what it gets back here is only
     * ever the source descriptor; the placeholder never reaches layout.
     */
    fallbackCanvasDimensions?: CanvasDimensions;
};

type VisibleViewerCanvasesParams = {
    canvases: any[];
    currentCanvasIndex: number;
    currentCanvasId: string | null;
    viewingMode: 'individuals' | 'paged' | 'continuous';
    pagedOffset: number;
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
 * `target` is the v3 spelling and `on` the v2 one, and both are read here.
 * Reading only `target` would silently drop the region of every raw v2
 * composite canvas — an image painting a sub-rectangle of its canvas would
 * land at the origin at full size, on top of its siblings.
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

/**
 * The image resource this painting annotation places, or `null` where it places
 * none.
 *
 * The classifier is the gate (`utils/paintingBodies`): a `Video`, `Sound`, or
 * `TextualBody` body answers `null` here and therefore never reaches
 * {@link getHeuristicServiceId}, the source descriptors, the static-image
 * loader, or the negative cache. Body-array unwrapping and Choice selection are
 * the classifier's too, in that order — the array first, so a
 * `body: [Choice(videos), Text(vtt)]` resolves its Choice instead of handing
 * back the Choice object itself.
 */
function getAnnotationResource(
    annotation: any,
    canvasId: string,
    getSelectedChoice?: (canvasId: string) => string | undefined,
): any | null {
    return findImageBody(annotation, getSelectedChoice?.(canvasId));
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

/**
 * An Image API base URI guessed from the shape of a resource id that declares
 * no service — `.../iiif/<identifier>/full/...` reduced to `.../iiif/<identifier>`.
 *
 * A guess, and it must only ever be made about an **image**: the test is that
 * the URL contains `/iiif/`, which a IIIF-hosted media file also does, and a
 * fabricated service id sends the tile pipeline off building `info.json` and
 * region requests against a video. Reached only from a body the classifier
 * passed (see {@link getAnnotationResource}), which is what makes that safe.
 */
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
            const resource = unwrapSpecificResource(rawResource);

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
                // This world normalizes BOTH axes by the Canvas's width (aspect
                // ratio preserved: 1 vertical unit = 1 horizontal unit = the
                // Canvas's width). So the y offset is divided by width, exactly
                // like x and width — not by height. The rule outlived the
                // renderer that introduced it: it is the normalized world the
                // export path still lays out in (see `components/canvasLayout`,
                // whose `canvasBoxWidth` is 1 unit wide for the same reason).
                y: region ? region.y / canvasDimensions.width : 0,
                width: region ? region.width / canvasDimensions.width : 1,
                height: region
                    ? region.height / canvasDimensions.width
                    : canvasDimensions.height / canvasDimensions.width,
            } satisfies ResolvedCanvasImage;
        })
        .filter((result): result is ResolvedCanvasImage => result !== null);
}

/**
 * Where one resolved painting image's pixels come from — the three-branch source
 * decision, made in one place for every consumer:
 *
 * 1. a service **plus** an Image API region is a prebuilt image request — a
 *    single static image of the cropped region;
 * 2. a service alone is a service to resolve against a tile pyramid or size
 *    ladder;
 * 3. otherwise the painting resource's own id is a plain static image.
 *
 * `null` where the image names no source at all.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function toImageSource(
    resolved: ResolvedCanvasImage,
): ImageSource | null {
    if (resolved.serviceId && resolved.imageApiRegion) {
        return {
            kind: 'static',
            url: buildIiifImageRequestUrl(resolved.serviceId, {
                region: getRegionString(resolved.imageApiRegion),
                size: 'max',
            }),
        };
    }

    if (resolved.serviceId) {
        return {
            kind: 'service',
            serviceId: resolved.serviceId,
            profile: resolved.serviceProfile,
        };
    }

    if (resolved.resourceId) {
        return { kind: 'static', url: resolved.resourceId };
    }

    return null;
}

/**
 * Whether a canvas paints at least one image core could actually request.
 *
 * The viewer's **renderability** gate, and the same decision painting makes:
 * {@link resolveAllCanvasImages} for the painting bodies, {@link toImageSource}
 * for whether each names a source. Existence only — it stops at the first image
 * that does — because the gate asks whether to mount the renderer at all and
 * nothing downstream of it reads a list.
 *
 * Deliberately WITHOUT `fallbackCanvasDimensions`, unlike the renderer's own
 * descriptors: a canvas declaring no usable dimensions resolves nothing here,
 * which is the gate's long-standing answer for it. The renderer's placeholder
 * exists so such a canvas can still be laid out once the gate has let it
 * through, and threading it in here would change what the viewer says about a
 * dimensionless canvas rather than what it does with a rendered one.
 */
export function canvasPaintsImage(
    canvas: any,
    options: ResolveCanvasImageOptions = {},
): boolean {
    return resolveAllCanvasImages(canvas, options).some(
        (resolved) => toImageSource(resolved) !== null,
    );
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
    const width =
        typeof options.width === 'number'
            ? Math.max(1, Math.round(options.width))
            : null;
    const height =
        typeof options.height === 'number'
            ? Math.max(1, Math.round(options.height))
            : null;

    return iiifImageRequestUrl(
        serviceId,
        options.size || (width ? `${width},` : `,${height || 1600}`),
        options.quality || 'default',
        options.format || 'jpg',
        options.region || 'full',
    );
}

/**
 * The canvases a frame of the viewer shows: the current one, its spread mate in
 * paged mode, or all of them in continuous mode.
 *
 * Exists so that "which canvases resolved an image" and "which canvases core
 * cannot render" are answered over the same set: the viewer asks both of this
 * one list, so on a spread they cannot disagree about which canvases were
 * being talked about.
 */
export function getVisibleViewerCanvases({
    canvases,
    currentCanvasIndex,
    currentCanvasId,
    viewingMode,
    pagedOffset,
}: VisibleViewerCanvasesParams): any[] {
    if (
        !canvases.length ||
        currentCanvasIndex < 0 ||
        !canvases[currentCanvasIndex]
    ) {
        return [];
    }

    if (viewingMode === 'continuous') return canvases;

    if (viewingMode === 'paged') {
        return getVisibleCanvasEntries({
            canvases,
            currentCanvasId,
            currentCanvasIndex,
            viewingMode,
            pagedOffset,
        }).map(({ canvas }) => canvas);
    }

    return [canvases[currentCanvasIndex]];
}
