import { getVisibleCanvasEntries } from '../components/viewerControls';
import { getCanvasLabel } from './canvasLabels';
import { getCanvasId, getResourceId } from './iiifIds';
import { getChoiceAlternatives, getPaintingAnnotations, getPaintingBody, isChoiceBody, } from './iiifParsing';
import { normalizeIiifTargets } from './iiifTargets';
import { resolveLanguageValue } from './languageMap';
function normalizeServiceId(serviceId) {
    return serviceId.endsWith('/info.json')
        ? serviceId.slice(0, -'/info.json'.length)
        : serviceId;
}
function getNumericDimension(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}
function getResourceDimensions(resource) {
    // `width`/`height` are spelled the same on a IIIF v2 and a v3 image
    // resource, so these two raw reads cover both versions.
    return {
        width: getNumericDimension(resource?.width),
        height: getNumericDimension(resource?.height),
    };
}
function getSpecificResourceSource(resource) {
    return resource?.type === 'SpecificResource' && resource?.source
        ? resource.source
        : null;
}
function getCanvasDimensions(canvas) {
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
function parseTargetRegion(annotation) {
    const region = normalizeIiifTargets(annotation?.target).find((target) => target.xywh)?.xywh;
    if (!region)
        return null;
    return {
        x: region[0],
        y: region[1],
        width: region[2],
        height: region[3],
    };
}
function parseImageApiRegionValue(value, resourceDimensions) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    const trimmed = value.trim();
    const isPercent = trimmed.startsWith('pct:');
    const raw = isPercent ? trimmed.slice(4) : trimmed;
    const parts = raw.split(',').map((part) => Number(part.trim()));
    if (parts.length !== 4 ||
        parts.some((part) => !Number.isFinite(part) || part < 0)) {
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
    if (typeof resourceDimensions.width !== 'number' ||
        typeof resourceDimensions.height !== 'number') {
        return null;
    }
    return {
        x: (parts[0] / 100) * resourceDimensions.width,
        y: (parts[1] / 100) * resourceDimensions.height,
        width: (parts[2] / 100) * resourceDimensions.width,
        height: (parts[3] / 100) * resourceDimensions.height,
    };
}
function parseImageApiSelectorRegion(resource, resourceDimensions) {
    return parseImageApiRegionValue(resource?.selector?.type === 'ImageApiSelector'
        ? resource.selector.region
        : null, resourceDimensions);
}
export function getRegionString(region) {
    return [region.x, region.y, region.width, region.height]
        .map((value) => Math.round(value))
        .join(',');
}
function getAnnotationResource(annotation, canvasId, getSelectedChoice) {
    let resource = null;
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
                ? items.find((item) => getResourceId(item) === selectedId)
                : null;
            body = selectedItem || items[0] || null;
        }
        resource = Array.isArray(body) ? body[0] : body;
    }
    return resource;
}
function isIiifImageProfile(profile) {
    if (typeof profile === 'string') {
        return (/^https?:\/\/iiif\.io\/api\/image\//.test(profile) ||
            profile === 'level0' ||
            profile === 'level1' ||
            profile === 'level2');
    }
    if (Array.isArray(profile)) {
        return profile.some((item) => isIiifImageProfile(item));
    }
    return false;
}
function normalizeProfile(profile) {
    if (typeof profile === 'string') {
        return profile || null;
    }
    if (Array.isArray(profile)) {
        const firstString = profile.find((item) => typeof item === 'string');
        return firstString || null;
    }
    return null;
}
function getImageService(resource) {
    let services = [];
    if (resource?.service) {
        services = Array.isArray(resource.service)
            ? resource.service
            : [resource.service];
    }
    if (!services.length) {
        return null;
    }
    return (services.find((item) => {
        // v3 spells the service type `type`, v2 `@type`; `profile` is
        // spelled the same in both.
        const type = item.type || item['@type'] || '';
        const profile = item.profile || '';
        return (type === 'ImageService1' ||
            type === 'ImageService2' ||
            type === 'ImageService3' ||
            isIiifImageProfile(profile));
    }) || null);
}
function getImageLabel(resource, annotation) {
    for (const candidate of [resource, annotation]) {
        if (!candidate)
            continue;
        // `label` is spelled the same in v2 and v3; `resolveLanguageValue`
        // reads the v2 bare string and `[{"@value"}]` array as well as the v3
        // language map.
        const rawLabel = candidate.label;
        if (rawLabel) {
            const resolved = resolveLanguageValue(rawLabel);
            if (resolved)
                return resolved;
        }
    }
    return null;
}
function getImageServiceDetails(resource) {
    const service = getImageService(resource);
    const serviceId = getResourceId(service);
    const rawProfile = service ? service.profile || '' : null;
    return {
        serviceId: serviceId ? normalizeServiceId(serviceId) : null,
        serviceProfile: normalizeProfile(rawProfile),
    };
}
function getHeuristicServiceId(resourceId) {
    if (!resourceId || !resourceId.includes('/iiif/')) {
        return null;
    }
    const parts = resourceId.split('/');
    const regionIndex = parts.findIndex((part) => part === 'full' || /^\d+,\d+,\d+,\d+$/.test(part));
    return regionIndex > 0 ? parts.slice(0, regionIndex).join('/') : null;
}
export { getCanvasLabel, getCanvasId };
export function resolveCanvasImage(canvas, options = {}) {
    const allResolved = resolveAllCanvasImages(canvas, options);
    return allResolved[0] || null;
}
export function resolveAllCanvasImages(canvas, options = {}) {
    const canvasId = getCanvasId(canvas);
    if (!canvasId) {
        return [];
    }
    const canvasDimensions = getCanvasDimensions(canvas);
    if (!canvasDimensions) {
        return [];
    }
    const annotations = getPaintingAnnotations(canvas);
    if (!annotations.length) {
        return [];
    }
    return annotations
        .map((annotation) => {
        const rawResource = getAnnotationResource(annotation, canvasId, options.getSelectedChoice);
        const resource = getSpecificResourceSource(rawResource) || rawResource;
        if (!resource) {
            return null;
        }
        const resourceId = getResourceId(resource);
        const resourceDimensions = getResourceDimensions(resource);
        const serviceDetails = getImageServiceDetails(resource);
        const serviceId = serviceDetails.serviceId || getHeuristicServiceId(resourceId);
        const region = parseTargetRegion(annotation);
        const imageApiRegion = parseImageApiSelectorRegion(rawResource, resourceDimensions);
        return {
            canvasId,
            annotation,
            resource,
            resourceId,
            label: getImageLabel(resource, annotation),
            canvasWidth: canvasDimensions.width,
            canvasHeight: canvasDimensions.height,
            resourceWidth: imageApiRegion?.width || resourceDimensions.width,
            resourceHeight: imageApiRegion?.height || resourceDimensions.height,
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
        };
    })
        .filter((result) => result !== null);
}
export function getCanvasTileSource(canvas, options = {}) {
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
export function getCanvasTileSources(canvas, options = {}) {
    return resolveAllCanvasImages(canvas, options)
        .map((resolved) => {
        let tileSource = null;
        if (resolved.serviceId && resolved.imageApiRegion) {
            tileSource = {
                type: 'image',
                url: buildIiifImageRequestUrl(resolved.serviceId, {
                    region: getRegionString(resolved.imageApiRegion),
                    size: 'max',
                }),
            };
        }
        else if (resolved.serviceId) {
            tileSource = `${resolved.serviceId}/info.json`;
        }
        else if (resolved.resourceId) {
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
        };
    })
        .filter((result) => result !== null);
}
export function buildIiifImageRequestUrl(serviceId, options = {
    width: 1600,
}) {
    const base = normalizeServiceId(serviceId);
    const region = options.region || 'full';
    const quality = options.quality || 'default';
    const format = options.format || 'jpg';
    const width = typeof options.width === 'number'
        ? Math.max(1, Math.round(options.width))
        : null;
    const height = typeof options.height === 'number'
        ? Math.max(1, Math.round(options.height))
        : null;
    const size = options.size || (width ? `${width},` : `,${height || 1600}`);
    return `${base}/${region}/${size}/0/${quality}.${format}`;
}
export function getViewerTileSources({ canvases, currentCanvasIndex, currentCanvasId, viewingMode, pagedOffset, getSelectedChoice, }) {
    if (!canvases.length ||
        currentCanvasIndex < 0 ||
        !canvases[currentCanvasIndex]) {
        return null;
    }
    let visibleCanvases = [canvases[currentCanvasIndex]];
    if (viewingMode === 'continuous') {
        visibleCanvases = canvases;
    }
    else if (viewingMode === 'paged') {
        visibleCanvases = getVisibleCanvasEntries({
            canvases,
            currentCanvasId,
            currentCanvasIndex,
            viewingMode,
            pagedOffset,
        }).map(({ canvas }) => canvas);
    }
    const tileSources = visibleCanvases.flatMap((canvas) => getCanvasTileSources(canvas, { getSelectedChoice }));
    return tileSources.length ? tileSources : null;
}
