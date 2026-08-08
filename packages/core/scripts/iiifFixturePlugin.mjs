/*
 * A fake IIIF Image API level 2 service, mounted on the dev server only.
 *
 * The tiled e2e fixture needs a real tile pyramid: an `info.json` advertising
 * tiles and scale factors, and a server that answers arbitrary
 * `region/size/rotation/quality.format` requests. Recording one would be a
 * large binary fixture; pointing at a public institution's server would make
 * the suite depend on the internet. Generating it is a few dozen lines, and it
 * renders the SAME numbered grid the static-image fixture uses — so the
 * geometric assertions written for ticket 04 carry over to deep zoom with no
 * new expectations.
 *
 * Development only. `apply: 'serve'` keeps it out of every build, and nothing
 * in `src/` imports it.
 */

import {
    HEIGHT,
    WIDTH,
    draw,
    encodePng,
    renderRegion,
} from './generate-grid-image.mjs';

/** Mount point. Any name under it is the same picture, so a fixture manifest
 *  can have several canvases with distinct services. */
const PREFIX = '/iiif-fixture/';

/**
 * A service whose id begins with this is served as a **strict Image API 2.1**
 * endpoint: a version 2 `info.json`, and a hard rejection of any quality other
 * than `default`.
 *
 * 2.1 deprecated `native` and requires `default` from compliance level 1
 * upwards, and a 2.0 document is indistinguishable from a 2.1 one — so a
 * renderer that infers `native` from "version 2" 404s every tile of a real
 * endpoint like this one, spends its one retry on each, and paints the canvas
 * permanently blank. Refusing `native` here is what makes that a test failure
 * rather than a field report.
 */
const V2_PREFIX = 'v2-';

/**
 * 256 with scale factors up to 8 gives four levels over a 1200x900 image —
 * a base level of exactly one tile, and 20 tiles at full resolution. Enough
 * for the in-flight window, the priority order, and the coarse chain all to be
 * observable, and small enough to render on demand without caching.
 */
const TILE_SIZE = 256;
const SCALE_FACTORS = [1, 2, 4, 8];

/** Rendered once, lazily: every tile is a resample of these pixels. */
let sourcePixels = null;

function source() {
    if (!sourcePixels) sourcePixels = draw();
    return sourcePixels;
}

/**
 * The version 2 form of the same service.
 *
 * Note what is NOT here: `preferredFormats` is a version 3 addition, so a
 * renderer asking this service for tiles falls back to its default format. The
 * middleware answers with PNG bytes and an `image/png` content type whatever
 * extension is asked for, which is what the browser decodes from.
 */
function infoJsonV2(origin, id) {
    return {
        '@context': 'http://iiif.io/api/image/2/context.json',
        '@id': `${origin}${PREFIX}${id}`,
        '@type': 'iiif:Image',
        protocol: 'http://iiif.io/api/image',
        profile: [
            'http://iiif.io/api/image/2/level2.json',
            { formats: ['png', 'jpg'], qualities: ['default'] },
        ],
        width: WIDTH,
        height: HEIGHT,
        tiles: [{ width: TILE_SIZE, scaleFactors: SCALE_FACTORS }],
        sizes: SCALE_FACTORS.map((factor) => ({
            width: Math.ceil(WIDTH / factor),
            height: Math.ceil(HEIGHT / factor),
        })),
    };
}

function infoJson(origin, id) {
    if (id.startsWith(V2_PREFIX)) return infoJsonV2(origin, id);

    return {
        '@context': 'http://iiif.io/api/image/3/context.json',
        id: `${origin}${PREFIX}${id}`,
        type: 'ImageService3',
        protocol: 'http://iiif.io/api/image',
        profile: 'level2',
        width: WIDTH,
        height: HEIGHT,
        maxHeight: HEIGHT,
        maxWidth: WIDTH,
        // PNG, not JPEG: the encoder here is lossless and dependency-free, and
        // the geometric assertions match marker colours exactly.
        preferredFormats: ['png'],
        tiles: [{ width: TILE_SIZE, scaleFactors: SCALE_FACTORS }],
        sizes: SCALE_FACTORS.map((factor) => ({
            width: Math.ceil(WIDTH / factor),
            height: Math.ceil(HEIGHT / factor),
        })),
    };
}

function parseRegion(parameter) {
    if (parameter === 'full' || parameter === 'square') {
        return { x: 0, y: 0, width: WIDTH, height: HEIGHT };
    }

    const parts = parameter.split(',').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
        return null;
    }

    const [x, y, width, height] = parts;
    if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;
    if (x >= WIDTH || y >= HEIGHT) return null;

    return {
        x,
        y,
        width: Math.min(width, WIDTH - x),
        height: Math.min(height, HEIGHT - y),
    };
}

function parseSize(parameter, region) {
    if (parameter === 'max' || parameter === 'full') {
        return { width: region.width, height: region.height };
    }

    const bare = parameter.startsWith('^') ? parameter.slice(1) : parameter;
    const [rawWidth, rawHeight] = bare.split(',');
    const width = rawWidth ? Number(rawWidth) : null;
    const height = rawHeight ? Number(rawHeight) : null;

    if (width && height) return { width, height };
    if (width) {
        return {
            width,
            height: Math.max(
                1,
                Math.round((region.height * width) / region.width),
            ),
        };
    }
    if (height) {
        return {
            width: Math.max(
                1,
                Math.round((region.width * height) / region.height),
            ),
            height,
        };
    }
    return null;
}

/** @returns {import('vite').Plugin} */
export function iiifFixture() {
    return {
        name: 'triiiceratops:iiif-fixture',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const url = request.url ?? '';
                if (!url.startsWith(PREFIX)) return next();

                const [path] = url.split('?');
                const rest = path.slice(PREFIX.length).split('/');
                const id = rest.shift();
                if (!id) return next();

                const origin = `http://${request.headers.host ?? 'localhost'}`;

                if (rest.length === 1 && rest[0] === 'info.json') {
                    const body = JSON.stringify(infoJson(origin, id));
                    response.setHeader('Content-Type', 'application/json');
                    response.setHeader('Access-Control-Allow-Origin', '*');
                    // No caching: a test that counts requests must see every
                    // one the renderer actually makes.
                    response.setHeader('Cache-Control', 'no-store');
                    response.end(body);
                    return undefined;
                }

                // {region}/{size}/{rotation}/{quality}.{format}
                if (rest.length !== 4) return next();

                const quality = rest[3].split('.')[0];
                if (id.startsWith(V2_PREFIX) && quality !== 'default') {
                    response.statusCode = 400;
                    response.end('unsupported quality');
                    return undefined;
                }

                const region = parseRegion(rest[0]);
                if (!region) {
                    response.statusCode = 400;
                    response.end('bad region');
                    return undefined;
                }

                const size = parseSize(rest[1], region);
                if (!size || size.width < 1 || size.height < 1) {
                    response.statusCode = 400;
                    response.end('bad size');
                    return undefined;
                }

                const pixels = renderRegion(
                    source(),
                    region,
                    size.width,
                    size.height,
                );

                response.setHeader('Content-Type', 'image/png');
                response.setHeader('Access-Control-Allow-Origin', '*');
                response.setHeader('Cache-Control', 'no-store');
                response.end(encodePng(pixels, size.width, size.height));
                return undefined;
            });
        },
    };
}
