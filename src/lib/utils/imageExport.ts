import {
    buildIiifImageRequestUrl,
    getRegionString,
    type ResolvedCanvasImage,
} from './resolveCanvasImage';
import {
    createIiifTileSource,
    isIiifLevel0Profile,
    getFullImageUrlForLevel,
} from '../components/osdTileSources';

// Browsers cap 2D canvas dimensions/area (commonly ~16k px per side and/or
// ~268MP total). Stay well under that so composite/world exports never
// silently produce a canvas the browser refuses to draw into.
const MAX_CANVAS_DIMENSION = 8000;
const MAX_CANVAS_AREA = 40_000_000;

export type ExportSizeOption = {
    width: number;
    height: number;
    label: string;
    // Only meaningful for a single resolved image (one canonical request
    // URL). Composite/multi-image callers derive their own per-image URLs
    // from `width`/`height` instead, so this is omitted for those options.
    url?: string;
};

export type ComposeImageEntry = {
    blob: Blob;
    x: number;
    y: number;
    width: number;
    height: number;
};

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export async function fetchImageBlob(
    url: string,
    requestInit?: RequestInit,
): Promise<Blob> {
    const response = await fetch(url, requestInit);
    if (!response.ok) {
        throw new Error(`Image request failed with ${response.status}.`);
    }
    return response.blob();
}

async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
    const objectUrl = URL.createObjectURL(blob);
    try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () =>
                reject(new Error('Unable to decode image for export.'));
            element.src = objectUrl;
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

/**
 * Draws pre-fetched image blobs onto a single offscreen canvas at their
 * given pixel rects and re-encodes the result as one blob. Shared by
 * pdf-export's per-page rasterization and the image-download plugin's
 * composite-canvas/current-world modes.
 */
export async function composeImages(
    entries: ComposeImageEntry[],
    canvasWidth: number,
    canvasHeight: number,
    format: 'image/png' | 'image/jpeg' = 'image/png',
): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(canvasWidth));
    canvas.height = Math.max(1, Math.round(canvasHeight));

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Unable to create a canvas for image export.');
    }

    for (const entry of entries) {
        const image = await loadImageElement(entry.blob);
        context.drawImage(image, entry.x, entry.y, entry.width, entry.height);
    }

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
            if (value) {
                resolve(value);
                return;
            }
            reject(new Error('Unable to export composed image.'));
        }, format);
    });
}

/**
 * Scales width/height down (preserving aspect ratio) so neither dimension
 * nor total area exceeds what browsers reliably allow for a 2D canvas.
 */
export function clampCompositeSize(
    width: number,
    height: number,
): { width: number; height: number; clamped: boolean } {
    let scale = 1;

    if (width > MAX_CANVAS_DIMENSION) {
        scale = Math.min(scale, MAX_CANVAS_DIMENSION / width);
    }
    if (height > MAX_CANVAS_DIMENSION) {
        scale = Math.min(scale, MAX_CANVAS_DIMENSION / height);
    }

    const area = width * height;
    if (area * scale * scale > MAX_CANVAS_AREA) {
        scale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA / area));
    }

    if (scale >= 1) {
        return {
            width: Math.round(width),
            height: Math.round(height),
            clamped: false,
        };
    }

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        clamped: true,
    };
}

/**
 * Builds the export request URL for a single resolved image at an optional
 * target pixel size. Level0 services can only be requested at their native
 * size (or one of the fixed sizes surfaced by `resolveExportSizeOptions`),
 * so any explicit width/height is ignored for them.
 */
export function getResolvedImageExportUrl(
    resolved: ResolvedCanvasImage,
    options: { width?: number; height?: number } = {},
): string | null {
    if (isIiifLevel0Profile(resolved.serviceProfile)) {
        return resolved.resourceId ?? null;
    }

    if (resolved.serviceId) {
        const region = resolved.imageApiRegion
            ? getRegionString(resolved.imageApiRegion)
            : undefined;
        const hasSize = Boolean(options.width || options.height);

        return buildIiifImageRequestUrl(resolved.serviceId, {
            region,
            size: hasSize ? undefined : 'max',
            width: options.width,
            height: options.height,
        });
    }

    return resolved.resourceId ?? null;
}

async function resolveLevel0SizeOptions(
    resolved: ResolvedCanvasImage,
): Promise<ExportSizeOption[]> {
    if (!resolved.serviceId) return [];

    const infoUrl = resolved.serviceId.endsWith('/info.json')
        ? resolved.serviceId
        : `${resolved.serviceId}/info.json`;

    try {
        const response = await fetch(infoUrl);
        if (!response.ok) return [];
        const data = await response.json();

        const osdModule = await import('openseadragon');
        const OSD = (osdModule as any).default || osdModule;
        const tileSource = createIiifTileSource(OSD, data, infoUrl);

        if (
            !tileSource ||
            typeof tileSource.minLevel !== 'number' ||
            typeof tileSource.maxLevel !== 'number' ||
            typeof tileSource.getLevelScale !== 'function'
        ) {
            return [];
        }

        const seen = new Set<string>();
        const options: ExportSizeOption[] = [];

        for (
            let level = tileSource.minLevel;
            level <= tileSource.maxLevel;
            level += 1
        ) {
            const scale = tileSource.getLevelScale(level);
            const width = Math.ceil(tileSource.width * scale);
            const height = Math.ceil(tileSource.height * scale);
            const key = `${width}x${height}`;
            if (seen.has(key)) continue;
            seen.add(key);

            options.push({
                width,
                height,
                label: `${width} × ${height}px`,
                url: getFullImageUrlForLevel(tileSource, level),
            });
        }

        return options.sort((a, b) => b.width - a.width);
    } catch {
        return [];
    }
}

export const EXPORT_RESOLUTION_PRESETS = [
    { fraction: 1, label: 'Original' },
    { fraction: 0.5, label: '50%' },
    { fraction: 0.25, label: '25%' },
];

/**
 * Builds a small "Original / 50% / 25%" ladder of pixel dimensions from a
 * native width/height. Shared by the single-image preset resolver below and
 * by the image-download plugin's composite/current-world size pickers,
 * which have no single canonical request URL to attach per option.
 */
export function buildRelativeSizeOptions(
    nativeWidth: number,
    nativeHeight: number,
    getUrl?: (size: {
        width: number;
        height: number;
        isOriginal: boolean;
    }) => string | null | undefined,
): ExportSizeOption[] {
    return EXPORT_RESOLUTION_PRESETS.map(({ fraction, label }) => {
        const width = Math.max(1, Math.round(nativeWidth * fraction));
        const height = Math.max(1, Math.round(nativeHeight * fraction));
        const url = getUrl?.({ width, height, isOriginal: fraction === 1 });

        return {
            width,
            height,
            label: `${label} (${width} × ${height}px)`,
            url: url ?? undefined,
        };
    }).filter((option) => !getUrl || Boolean(option.url));
}

function resolvePresetSizeOptions(
    resolved: ResolvedCanvasImage,
): ExportSizeOption[] {
    const nativeWidth = resolved.resourceWidth;
    const nativeHeight = resolved.resourceHeight;

    if (!resolved.serviceId || !nativeWidth || !nativeHeight) {
        const url = getResolvedImageExportUrl(resolved);
        return url
            ? [
                  {
                      width: nativeWidth ?? 0,
                      height: nativeHeight ?? 0,
                      label: 'Original',
                      url,
                  },
              ]
            : [];
    }

    return buildRelativeSizeOptions(nativeWidth, nativeHeight, ({ width, height, isOriginal }) =>
        getResolvedImageExportUrl(resolved, isOriginal ? {} : { width, height }),
    );
}

/**
 * Lists the resolutions a single resolved image can be requested/downloaded
 * at. Level0 IIIF services only support a fixed list of pre-rendered sizes
 * (from `info.json`), so those are enumerated exactly; other services get a
 * small set of relative presets built from their native dimensions.
 */
export async function resolveExportSizeOptions(
    resolved: ResolvedCanvasImage,
): Promise<ExportSizeOption[]> {
    if (isIiifLevel0Profile(resolved.serviceProfile)) {
        const levelOptions = await resolveLevel0SizeOptions(resolved);
        if (levelOptions.length) return levelOptions;

        return resolved.resourceId
            ? [
                  {
                      width: resolved.resourceWidth ?? 0,
                      height: resolved.resourceHeight ?? 0,
                      label: 'Original',
                      url: resolved.resourceId,
                  },
              ]
            : [];
    }

    return resolvePresetSizeOptions(resolved);
}
