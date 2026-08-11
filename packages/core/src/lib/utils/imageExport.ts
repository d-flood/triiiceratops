import {
    buildIiifImageRequestUrl,
    getRegionString,
    type ResolvedCanvasImage,
} from './resolveCanvasImage';
import { parseImageService } from '../renderer/imageService';
import {
    buildSizeLadder,
    isLevel0Profile,
    ladderFromPyramid,
    rungUrl,
    type LadderRung,
    type SizeLadder,
} from '../renderer/sizeLadder';
import {
    buildPyramid,
    tileRegion,
    tileUrl,
    type PyramidLevel,
    type TilePyramid,
} from '../renderer/tilePyramid';

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

export function getCompositeImagePlacement(
    image: ResolvedCanvasImage,
    canvasWidth: number,
    canvasHeight: number,
    scale: number,
) {
    const width = Math.max(1, Math.round(image.width * canvasWidth * scale));
    const aspect =
        image.resourceWidth && image.resourceHeight
            ? image.resourceHeight / image.resourceWidth
            : canvasHeight / canvasWidth;
    return {
        x: Math.round(image.x * canvasWidth * scale),
        y: Math.round(image.y * canvasHeight * scale),
        width,
        height: Math.max(1, Math.round(width * aspect)),
    };
}

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
 * target pixel size.
 *
 * A level0 service has no request URL derivable from the manifest at all: what
 * it will answer is only knowable from `info.json`, and the base URI those
 * requests go to can differ from the one that fetched the document (see
 * {@link fetchExportImageBlob}). So this reports the published resource — the
 * one image such a manifest guarantees without asking — and callers that can
 * afford a fetch should go through `fetchExportImageBlob` instead of this.
 */
export function getResolvedImageExportUrl(
    resolved: ResolvedCanvasImage,
    options: { width?: number; height?: number } = {},
): string | null {
    if (isLevel0Profile(resolved.serviceProfile)) {
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

/**
 * Whether a manifest's declared image-service profile is level0 — the one fact
 * that decides whether an exporter may build a request URL from the manifest at
 * all, or has to read `info.json` first (see {@link fetchExportImageBlob}).
 *
 * A thin alias over `renderer/sizeLadder.isLevel0Profile`, exported so both
 * export plugins can ask it without the renderer's whole source model becoming
 * public API. What it saves a caller is the three spellings a profile uses in the
 * wild — the bare version 3 token, the version 2 profile URI, and the version 1
 * `#level0` fragment — the last of which hand-rolled checks reliably miss.
 */
export function isLevel0ImageService(profile: unknown): boolean {
    return isLevel0Profile(profile);
}

/**
 * A level0 service's exportable resolutions, read from its own `info.json`.
 *
 * A level0 service serves only precomputed derivatives, so an export ladder for
 * one is not a set of fractions of the original — it is the list of images that
 * actually exist. Derived through the renderer's own source model
 * (`renderer/tilePyramid` and `renderer/sizeLadder`), which is the second
 * consumer that model has: what export offers and what the renderer requests
 * are the same list, built by the same code.
 *
 * `pyramid` is the distinction between the two level0 shapes, and it decides how
 * a resolution is fetched rather than merely which ones exist — see
 * {@link level0RungUrl}.
 */
type Level0Export = {
    ladder: SizeLadder;
    /** Non-null exactly when the service advertises a tile grid. */
    pyramid: TilePyramid | null;
};

/**
 * `info.json` for a service, or `null` if it did not arrive or is not one.
 *
 * Deliberately its own fetch rather than the renderer's page-shared
 * `imageServiceCache`: an auth gateway that signs `info.json`'s `id` signs it
 * with an expiry, and the cache's whole point is that it never refetches. A
 * download that reused a base URI captured when the canvas first came into view
 * would 401 in exactly the sessions the signing exists for.
 */
async function fetchServiceFacts(serviceId: string) {
    try {
        const response = await fetch(`${serviceId}/info.json`);
        if (!response.ok) return null;
        return parseImageService(await response.json());
    } catch {
        return null;
    }
}

async function resolveLevel0Export(
    resolved: ResolvedCanvasImage,
): Promise<Level0Export | null> {
    if (!resolved.serviceId) return null;

    // `resolveCanvasImage` already strips this, but a caller may hand us a
    // `ResolvedCanvasImage` it built itself.
    const serviceId = resolved.serviceId.endsWith('/info.json')
        ? resolved.serviceId.slice(0, -'/info.json'.length)
        : resolved.serviceId;

    const facts = await fetchServiceFacts(serviceId);
    if (!facts) return null;

    const pyramid = buildPyramid(serviceId, facts);
    const ladder = pyramid
        ? ladderFromPyramid(pyramid)
        : buildSizeLadder(serviceId, facts);
    if (!ladder) return null;

    return { ladder, pyramid };
}

/**
 * The whole-image request URL for one rung, or `null` when the service holds no
 * single file for it.
 *
 * A service advertising only `sizes[]` has nothing but whole images, so every
 * rung is one request. A **static tile tree** is different, and the difference
 * is the bug this function exists to state: the files it holds are its tiles,
 * plus the full-size whole image that level0 compliance requires at the
 * canonical whole-image URL. It need not hold a whole-image derivative at every
 * scale factor, and the trees in the wild do not — asking for one 404s, which is
 * what a size picker offering six resolutions and delivering one looked like.
 * `null` sends the caller to {@link composePyramidLevel}, which asks for the
 * tiles instead: the exact URLs the renderer paints that level with.
 */
function level0RungUrl(
    { ladder, pyramid }: Level0Export,
    rung: LadderRung,
): string | null {
    if (!pyramid) return rungUrl(ladder, rung);

    const isFullSize =
        rung.width === ladder.width && rung.height === ladder.height;
    return isFullSize ? rungUrl(ladder, rung) : null;
}

/** Whether `composeImages` can hold an image this large. */
function canCompose(width: number, height: number): boolean {
    return (
        width <= MAX_CANVAS_DIMENSION &&
        height <= MAX_CANVAS_DIMENSION &&
        width * height <= MAX_CANVAS_AREA
    );
}

/** Whether an export can produce this rung at all, by either route. */
function isRungExportable(
    source: Level0Export,
    rung: LadderRung,
    level: PyramidLevel | undefined,
): boolean {
    if (level0RungUrl(source, rung)) return true;
    return Boolean(level) && canCompose(rung.width, rung.height);
}

/**
 * One pyramid level as a single image, stitched from its tiles.
 *
 * The tile URLs and the tile geometry both come from `renderer/tilePyramid`, so
 * this asks for precisely the files the viewer is already displaying — including
 * the partial tiles at the right and bottom edges, and including the request
 * spelling a static version 3 tree needs (`tileUrl` owns that, and this must not
 * learn it a second time). Each tile is drawn at the size it was requested at,
 * so the composite is exact and not resampled.
 */
async function composePyramidLevel(
    pyramid: TilePyramid,
    level: PyramidLevel,
    format: 'image/png' | 'image/jpeg',
    imageRequest: RequestInit | undefined,
): Promise<Blob> {
    const entries: ComposeImageEntry[] = [];

    for (let row = 0; row < level.rows; row += 1) {
        for (let column = 0; column < level.columns; column += 1) {
            const region = tileRegion(pyramid, level, column, row);
            entries.push({
                blob: await fetchImageBlob(
                    tileUrl(pyramid, level, column, row),
                    imageRequest,
                ),
                // Region offsets are whole multiples of the tile span, so this
                // is exact: no seam can open up from rounding.
                x: column * pyramid.tileSize,
                y: row * pyramid.tileSize,
                width: Math.max(1, Math.ceil(region.width / level.scaleFactor)),
                height: Math.max(
                    1,
                    Math.ceil(region.height / level.scaleFactor),
                ),
            });
        }
    }

    return composeImages(entries, level.width, level.height, format);
}

/**
 * The rung to serve a request for `width` from: the smallest that is at least as
 * wide, so the caller downsamples rather than upscales, and the largest
 * available when none is big enough. With no width asked for, the largest —
 * "Original".
 */
function pickRung(ladder: SizeLadder, width?: number): LadderRung {
    const rungs = ladder.rungs;
    const largest = rungs[rungs.length - 1];
    if (!width) return largest;
    return rungs.find((rung) => rung.width >= width) ?? largest;
}

async function fetchLevel0Blob(
    source: Level0Export,
    width: number | undefined,
    format: 'image/png' | 'image/jpeg',
    imageRequest: RequestInit | undefined,
): Promise<Blob> {
    const { ladder, pyramid } = source;
    const rung = pickRung(ladder, width);
    const url = level0RungUrl(source, rung);
    if (url) return fetchImageBlob(url, imageRequest);

    const level = pyramid?.levels[rung.index];
    // A level too large to stitch onto one canvas falls back to the full-size
    // whole image, which is a single request and always exists. That is more
    // pixels than were asked for, never fewer, so a caller drawing it into a
    // placement box still gets the right picture.
    if (!level || !canCompose(rung.width, rung.height)) {
        return fetchImageBlob(
            rungUrl(ladder, ladder.rungs[ladder.rungs.length - 1]),
            imageRequest,
        );
    }

    return composePyramidLevel(pyramid!, level, format, imageRequest);
}

/**
 * The pixels for one resolved image at (about) a target width — however many
 * requests that takes.
 *
 * The seam an exporter should reach for instead of
 * {@link getResolvedImageExportUrl}, because for a level0 source no single URL
 * is the answer: the base URI to request from is only in `info.json` (an auth
 * gateway can sign it), and a static tile tree may hold the wanted resolution
 * only as tiles. Both are handled here so that every export mode — one image, a
 * composited canvas, the whole current view — gets them by construction rather
 * than each reimplementing the parts it happens to need.
 *
 * `target.url` is the fast path: an {@link ExportSizeOption} that carries one is
 * already a single canonical request, so passing the option straight through
 * spends no extra fetch.
 *
 * `target.imageRequest` is merged into every image request this makes — a
 * resolution assembled from tiles carries it on each tile — so a service behind
 * authentication is reached the same way whatever its compliance level. It
 * cannot make a service that withholds `Access-Control-Allow-Origin` readable;
 * nothing in the browser can, and an export against one fails.
 */
export async function fetchExportImageBlob(
    resolved: ResolvedCanvasImage,
    target: {
        url?: string;
        width?: number;
        height?: number;
        format?: 'image/png' | 'image/jpeg';
        imageRequest?: RequestInit;
    } = {},
): Promise<Blob> {
    const { imageRequest } = target;

    if (target.url) return fetchImageBlob(target.url, imageRequest);

    if (isLevel0Profile(resolved.serviceProfile)) {
        const source = await resolveLevel0Export(resolved);
        if (source) {
            return fetchLevel0Blob(
                source,
                target.width,
                target.format ??
                    (source.ladder.format === 'png'
                        ? 'image/png'
                        : 'image/jpeg'),
                imageRequest,
            );
        }
        // `info.json` never arrived. The published resource is all that is left,
        // and it is what this path returned unconditionally before.
    }

    const url = getResolvedImageExportUrl(resolved, {
        width: target.width,
        height: target.height,
    });
    if (!url) {
        throw new Error('No exportable image found for this canvas.');
    }
    return fetchImageBlob(url, imageRequest);
}

async function resolveLevel0SizeOptions(
    resolved: ResolvedCanvasImage,
): Promise<ExportSizeOption[]> {
    const source = await resolveLevel0Export(resolved);
    if (!source) return [];

    const { ladder, pyramid } = source;
    const seen = new Set<string>();
    const options: ExportSizeOption[] = [];

    for (const rung of ladder.rungs) {
        const key = `${rung.width}x${rung.height}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Only offer what can actually be delivered. A picker listing a
        // resolution the service will not answer is worse than a shorter list.
        if (!isRungExportable(source, rung, pyramid?.levels[rung.index])) {
            continue;
        }

        options.push({
            width: rung.width,
            height: rung.height,
            label: `${rung.width} × ${rung.height}px`,
            // Omitted for a rung that has to be stitched from tiles: there is
            // no one URL for it, which is exactly what `url` documents.
            url: level0RungUrl(source, rung) ?? undefined,
        });
    }

    return options.sort((a, b) => b.width - a.width);
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

    return buildRelativeSizeOptions(
        nativeWidth,
        nativeHeight,
        ({ width, height, isOriginal }) =>
            getResolvedImageExportUrl(
                resolved,
                isOriginal ? {} : { width, height },
            ),
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
    if (isLevel0Profile(resolved.serviceProfile)) {
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
