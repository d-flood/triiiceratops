/*
 * Serves `tests/media/` at `/media/` on the dev server.
 *
 * The e2e AV suite must run with no network access, so it plays generated
 * media committed under `tests/media/` (see that directory's `regenerate.sh`).
 * Those bytes cannot live in `public/`: `public/` is copied verbatim into every
 * demo build and into the published site, and the media exists for the test
 * suite alone. Mounting the directory here keeps it out of every artifact while
 * making it same-origin with the Playwright `baseURL` — which is what the AV
 * manifests under `tests/media/manifests/` depend on, since every media URL in
 * them is root-relative.
 *
 * Development only. `apply: 'serve'` keeps it out of every build, and nothing
 * in `src/` imports it.
 *
 * Range requests are answered properly rather than with the whole file: WebKit
 * will not seek in media served without `206 Partial Content`, and seeking is
 * most of what the AV specs assert.
 */

import { createReadStream, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';

/** Mount point, and the prefix every URL in the local AV manifests uses. */
const PREFIX = '/media/';

const MEDIA_DIR = fileURLToPath(new URL('../tests/media', import.meta.url));

/**
 * Content types the browser needs to be told about. Node has no built-in
 * table, and the ones that matter here are exactly the ones a generic guess
 * gets wrong: `.m3u8` and `.ts` decide whether an HLS playlist is parsed or
 * downloaded, and `.vtt` decides whether a `<track>` produces cues at all.
 */
const CONTENT_TYPES = {
    '.dat': 'application/octet-stream',
    '.json': 'application/json',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ts': 'video/mp2t',
    '.vtt': 'text/vtt',
};

function contentType(path) {
    const dot = path.lastIndexOf('.');
    return (
        (dot === -1 ? null : CONTENT_TYPES[path.slice(dot).toLowerCase()]) ??
        'application/octet-stream'
    );
}

/**
 * The requested file's absolute path, or `null` if the request escapes the
 * media directory. Decoding happens before normalising, so an encoded `..`
 * cannot slip past.
 */
function resolveFile(url) {
    const [path] = url.split('?');
    let relative;
    try {
        relative = decodeURIComponent(path.slice(PREFIX.length));
    } catch {
        return null;
    }

    const absolute = normalize(join(MEDIA_DIR, relative));
    return absolute.startsWith(MEDIA_DIR + sep) ? absolute : null;
}

/** A range naming nothing inside the representation: answer `416`. */
const UNSATISFIABLE = Symbol('unsatisfiable');

/**
 * A single `bytes=` range against a known size, resolved per RFC 9110 §14.1.2.
 *
 * Returns `null` when there is no usable `Range` header at all (answer `200`
 * with the whole representation), `UNSATISFIABLE` when the range names nothing
 * inside the file, and otherwise the clamped `{ start, end }`.
 *
 * Clamping rather than rejecting is the part that matters here. A media element
 * probing a file it has not measured routinely asks for more than exists — an
 * open-ended `bytes=0-`, an over-long `bytes=0-999999`, a suffix longer than
 * the file — and every one of those must still come back `206`, because WebKit
 * treats a `200` as "this server cannot seek".
 */
function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
    if (!match) return null;

    const [, rawStart, rawEnd] = match;
    if (!rawStart && !rawEnd) return null;

    if (!rawStart) {
        // A suffix range (`bytes=-500`) counts back from the end; asking for
        // more bytes than exist yields the whole representation.
        const suffix = Number(rawEnd);
        if (suffix === 0 || size === 0) return UNSATISFIABLE;
        return { start: Math.max(0, size - suffix), end: size - 1 };
    }

    const start = Number(rawStart);
    // An absent or past-the-end last-byte-pos clamps to the final byte. Only a
    // first-byte-pos at or past the end is unsatisfiable.
    const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
    if (start >= size || start > end) return UNSATISFIABLE;
    return { start, end };
}

/**
 * A miss under `/media/` is a 404, never a fall-through. Handing the request
 * back to Vite would let the SPA fallback answer a missing `.mp4` with
 * `200 text/html`, and a spec whose media silently became a web page is the
 * least legible failure this fixture could produce.
 */
function notFound(response) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain');
    response.end('no such media fixture');
}

/** @returns {import('vite').Plugin} */
export function mediaFixture() {
    return {
        name: 'triiiceratops:media-fixture',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const url = request.url ?? '';
                if (!url.startsWith(PREFIX)) return next();

                const file = resolveFile(url);
                if (!file) {
                    response.statusCode = 403;
                    response.end('outside the media fixture directory');
                    return undefined;
                }

                let size;
                try {
                    const stats = statSync(file);
                    if (!stats.isFile()) {
                        notFound(response);
                        return undefined;
                    }
                    size = stats.size;
                } catch {
                    notFound(response);
                    return undefined;
                }

                response.setHeader('Content-Type', contentType(file));
                response.setHeader('Accept-Ranges', 'bytes');
                // No caching, for the same reason the IIIF fixture sets it: a
                // spec that counts requests must see every one.
                response.setHeader('Cache-Control', 'no-store');

                const range = parseRange(request.headers.range, size);
                if (range === UNSATISFIABLE) {
                    response.statusCode = 416;
                    response.setHeader('Content-Range', `bytes */${size}`);
                    response.end();
                    return undefined;
                }

                if (range) {
                    response.statusCode = 206;
                    response.setHeader(
                        'Content-Range',
                        `bytes ${range.start}-${range.end}/${size}`,
                    );
                    response.setHeader(
                        'Content-Length',
                        range.end - range.start + 1,
                    );
                } else {
                    response.setHeader('Content-Length', size);
                }

                if (request.method === 'HEAD') {
                    response.end();
                    return undefined;
                }

                // `pipeline`, not `pipe`: `pipe` forwards neither the source's
                // errors nor the destination's, so an fs failure after the
                // `statSync` above — EMFILE, with five Playwright projects
                // running fully parallel, or `regenerate.sh` rewriting a file
                // mid-suite — would surface as an unhandled `'error'` event and
                // take the dev server down for every worker at once. It also
                // destroys the read stream when a client abandons a request,
                // which is what a seek does to the range it was mid-way through.
                pipeline(
                    createReadStream(file, range ?? undefined),
                    response,
                    () => {},
                );
                return undefined;
            });
        },
    };
}
