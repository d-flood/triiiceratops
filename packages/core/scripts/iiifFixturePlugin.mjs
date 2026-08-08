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
 * The **800-canvas continuous fixture**, generated rather than checked in.
 *
 * Virtualization is only meaningful against a manifest of several hundred
 * canvases: "load everything" passes any test written against a short one
 * (spec §Further Notes), and the `remove-manifesto` corpus is a PARSER corpus —
 * it says nothing about renderer residency. So this fixture is part of the
 * work, and it is dedicated to renderer and network behaviour: every canvas is
 * the same numbered grid at the same Canvas dimensions, through its OWN image
 * service, so nothing dedupes and one `info.json` per canvas is exactly what an
 * unvirtualized renderer would ask for.
 *
 * Generated for two reasons. It is ~300 KB of JSON that would otherwise sit in
 * the repository and in the npm tarball for one spec's benefit; and being
 * arithmetic, every position a test asserts — canvas *i* begins at
 * `i * (WIDTH + gap)` — is derivable rather than transcribed.
 */
const CONTINUOUS_MANIFEST = '/demo-manifests/continuous-800/manifest.json';
const CONTINUOUS_CANVAS_COUNT = 800;
/** Service id prefix for that fixture's canvases: one level 2 service each. */
const CONTINUOUS_SERVICE = 'c800-';

function continuousManifest(origin) {
    const base = `${origin}${CONTINUOUS_MANIFEST.replace('/manifest.json', '')}`;

    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: `${origin}${CONTINUOUS_MANIFEST}`,
        type: 'Manifest',
        behavior: ['continuous'],
        label: { en: ['800-canvas continuous renderer fixture'] },
        summary: {
            en: [
                'A synthetic 800-folio manuscript for the virtualization assertions. Every canvas is the same numbered grid at 1200x900 through its own IIIF level 2 service, so median-height normalization is the identity, canvas i begins at i * (1200 + gap), and one info.json per canvas is precisely what a renderer that fetched the whole manifest would ask for.',
            ],
        },
        items: Array.from({ length: CONTINUOUS_CANVAS_COUNT }, (_, index) => {
            const service = `${origin}${PREFIX}${CONTINUOUS_SERVICE}${index}`;
            return {
                id: `${base}/canvas/${index}`,
                type: 'Canvas',
                label: { en: [`Folio ${index}`] },
                width: WIDTH,
                height: HEIGHT,
                items: [
                    {
                        id: `${base}/page/${index}`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${base}/annotation/${index}`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body: {
                                    id: `${service}/full/max/0/default.png`,
                                    type: 'Image',
                                    format: 'image/png',
                                    width: WIDTH,
                                    height: HEIGHT,
                                    service: [
                                        {
                                            id: service,
                                            type: 'ImageService3',
                                            profile: 'level2',
                                        },
                                    ],
                                },
                                target: `${base}/canvas/${index}`,
                            },
                        ],
                    },
                ],
            };
        }),
    };
}

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
 * A service whose id begins with this is served as a **level0 service that
 * advertises tiles**: the same pyramid as above, but it refuses any request
 * whose implied scale factor it did not advertise.
 *
 * A level0 endpoint is a tree of pre-generated files, so an unadvertised size is
 * not a slow answer, it is a missing file. Answering it anyway — which a fake
 * service naturally does, because it renders on demand — would let the renderer
 * derive whatever pyramid it liked and the e2e suite would never notice. The
 * refusal is what makes "level selection never requests a non-advertised scale
 * factor" a test rather than a claim.
 */
const LEVEL0_TILED_PREFIX = 'l0-tiled-';

/**
 * A service whose id begins with this advertises **only fixed sizes**: no
 * `tiles` at all, and every request that is not one of the advertised whole
 * images is a 404. This is the **size-ladder source**.
 */
const LEVEL0_SIZES_PREFIX = 'l0-sizes-';

/**
 * A service whose id begins with this is a **frozen pre-2016 static tree**: a
 * size-ladder source described by a version 2 `info.json`, whose files were all
 * generated with the `native` quality that Image API 2.1 later deprecated. Any
 * request for `default` is a 404, because that file was never written.
 *
 * The renderer deliberately asks every version 2 service for `default` — 2.1
 * requires it, and a 2.0 document is indistinguishable from a 2.1 one, so
 * inferring `native` from "version 2" breaks every modern endpoint. This is the
 * shape that answer gets wrong, and for a size ladder it is not a blurrier
 * canvas: every rung shares the quality parameter, so ALL of them 404, each
 * burns its one retry, and the negative cache blanks the canvas for the life of
 * the page. The fallback that buys the answer back (one request per service) is
 * only honest if a fixture actually refuses `default`.
 */
const LEVEL0_V2_SIZES_PREFIX = 'l0-v2-sizes-';

/** Both sizes-only shapes: no tiling at all, `sizes` is the whole of the API. */
function isSizesOnly(id) {
    return (
        id.startsWith(LEVEL0_SIZES_PREFIX) ||
        id.startsWith(LEVEL0_V2_SIZES_PREFIX)
    );
}

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

/** The whole images this service admits to holding, largest first. */
const ADVERTISED_SIZES = SCALE_FACTORS.map((factor) => ({
    width: Math.ceil(WIDTH / factor),
    height: Math.ceil(HEIGHT / factor),
}));

/**
 * The two level0 shapes, which differ in exactly one key.
 *
 * With `tiles`, a level0 service is an ordinary pyramid whose levels are
 * restricted to the advertised scale factors. Without it, there is no tiling at
 * all and `sizes` is the whole of what can be asked for.
 */
function infoJsonLevel0(origin, id) {
    const document = {
        '@context': 'http://iiif.io/api/image/3/context.json',
        id: `${origin}${PREFIX}${id}`,
        type: 'ImageService3',
        protocol: 'http://iiif.io/api/image',
        profile: 'level0',
        width: WIDTH,
        height: HEIGHT,
        preferredFormats: ['png'],
        sizes: ADVERTISED_SIZES,
    };

    if (id.startsWith(LEVEL0_TILED_PREFIX)) {
        document.tiles = [{ width: TILE_SIZE, scaleFactors: SCALE_FACTORS }];
    }

    return document;
}

/**
 * Why a level0 service would not hold this file, or `null` if it would.
 *
 * A conformant level0 endpoint answers 404 for anything outside the derivatives
 * it generated, which is the behaviour that punishes a renderer for inventing
 * requests. Nothing here is enforced for the level 2 ids.
 */
function level0Violation(id, regionParameter, sizeParameter) {
    if (isSizesOnly(id)) {
        if (regionParameter !== 'full') {
            return 'level0: only the full region exists';
        }
        // The original, spelled `max` in version 3 and `full` in version 2.
        if (sizeParameter === 'max' || sizeParameter === 'full') return null;
        return ADVERTISED_SIZES.some(
            (size) => sizeParameter === `${size.width},`,
        )
            ? null
            : 'level0: unadvertised size';
    }

    if (!id.startsWith(LEVEL0_TILED_PREFIX)) return null;

    const region = parseRegion(regionParameter);
    const size = region ? parseSize(sizeParameter, region) : null;
    // Malformed: let the ordinary 400 path answer rather than masking it.
    if (!region || !size) return null;
    if (sizeParameter === 'max' || sizeParameter === 'full') return null;

    // A WHOLE-IMAGE request is a `sizes[]` question, not a scale-factor one —
    // and the two are not the same list. A level0 tree writes whole-image
    // derivatives only for the entries in `sizes[]`, so `ceil(width / factor)`
    // can name a file the generator never wrote whenever the image width is not
    // a multiple of the factor. Validating this against SCALE_FACTORS instead
    // is how a base level that 404s in the field passes here.
    if (
        region.x === 0 &&
        region.y === 0 &&
        region.width === WIDTH &&
        region.height === HEIGHT
    ) {
        return ADVERTISED_SIZES.some(
            (advertised) => advertised.width === size.width,
        )
            ? null
            : 'level0: unadvertised whole-image size';
    }

    // The tile was generated by downscaling its region by one advertised
    // factor; `ceil` is the rounding the Image API's canonical size form uses.
    return SCALE_FACTORS.some(
        (factor) => Math.ceil(region.width / factor) === size.width,
    )
        ? null
        : 'level0: unadvertised scale factor';
}

/**
 * The version 2 form of a size-ladder source — the frozen static tree.
 *
 * No `tiles`, a level0 profile, and `sizes` as the whole of the API. The
 * `qualities` it declares are the truth about what is on disk: `native` only.
 */
function infoJsonLevel0V2(origin, id) {
    return {
        '@context': 'http://iiif.io/api/image/2/context.json',
        '@id': `${origin}${PREFIX}${id}`,
        '@type': 'iiif:Image',
        protocol: 'http://iiif.io/api/image',
        profile: [
            'http://iiif.io/api/image/2/level0.json',
            { formats: ['jpg'], qualities: ['native'] },
        ],
        width: WIDTH,
        height: HEIGHT,
        sizes: ADVERTISED_SIZES,
    };
}

function infoJson(origin, id) {
    if (id.startsWith(LEVEL0_V2_SIZES_PREFIX)) {
        return infoJsonLevel0V2(origin, id);
    }
    if (id.startsWith(V2_PREFIX)) return infoJsonV2(origin, id);
    if (
        id.startsWith(LEVEL0_TILED_PREFIX) ||
        id.startsWith(LEVEL0_SIZES_PREFIX)
    ) {
        return infoJsonLevel0(origin, id);
    }

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
                const origin = `http://${request.headers.host ?? 'localhost'}`;

                if (url.split('?')[0] === CONTINUOUS_MANIFEST) {
                    response.setHeader('Content-Type', 'application/json');
                    response.setHeader('Access-Control-Allow-Origin', '*');
                    // No caching, for the same reason `info.json` is not
                    // cached: a spec that counts requests must see every one.
                    response.setHeader('Cache-Control', 'no-store');
                    response.end(JSON.stringify(continuousManifest(origin)));
                    return undefined;
                }

                if (!url.startsWith(PREFIX)) return next();

                const [path] = url.split('?');
                const rest = path.slice(PREFIX.length).split('/');
                const id = rest.shift();
                if (!id) return next();

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

                // 404 rather than 400: the frozen tree has no opinion about
                // `default`, it simply has no such FILE — which is exactly what
                // makes it indistinguishable from any other missing derivative
                // and puts the whole ladder into the negative cache unless the
                // renderer tries the other spelling.
                if (
                    id.startsWith(LEVEL0_V2_SIZES_PREFIX) &&
                    quality !== 'native'
                ) {
                    response.statusCode = 404;
                    response.end('level0: only native derivatives exist');
                    return undefined;
                }

                const missing = level0Violation(id, rest[0], rest[1]);
                if (missing) {
                    // 404, not 400: a level0 service has no such FILE, and the
                    // renderer's negative cache is what must handle that.
                    response.statusCode = 404;
                    response.end(missing);
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
