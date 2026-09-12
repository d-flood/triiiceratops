#!/usr/bin/env node
/*
 * Serve the built tree over HTTP for the browser suite.
 *
 * The score gate has to measure the published site rather than a development
 * server: the SEO category reads `robots.txt` and `sitemap.xml` at the tree's
 * root, the search bundle is written after the bundler has finished, and the
 * consumer examples are placed afterwards too. A development server proxying
 * those in would be a second definition of the site, able to be correct while
 * the real one is broken.
 *
 * Static only, and deliberately dumb — the closer this is to a plain file host,
 * the closer the measurement is to production.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.map': 'application/json; charset=utf-8',
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? fallback : args[at + 1];
};

const root = resolve(flag('root', 'published'));
const port = Number(flag('port', '4190'));

if (!existsSync(join(root, 'index.html'))) {
    console.error(
        `serve-published: no index.html under ${root} — build the tree first ` +
            'with `pnpm build:all`.',
    );
    process.exit(1);
}

/**
 * Resolve a request path to a file inside `root`, or `null`.
 *
 * A directory resolves to its `index.html`, which is what makes the site's
 * trailing-slash routes (`/size/`) work the way a static host serves them.
 */
function resolveFile(pathname) {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    // `normalize` collapses `..` before the prefix check, so a traversal attempt
    // is rejected rather than escaping the root.
    const candidate = resolve(join(root, normalize(decoded)));
    if (candidate !== root && !candidate.startsWith(root + sep)) return null;
    if (!existsSync(candidate)) return null;
    if (statSync(candidate).isDirectory()) {
        const index = join(candidate, 'index.html');
        return existsSync(index) ? index : null;
    }
    return candidate;
}

const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://127.0.0.1');
    const file = resolveFile(pathname);

    if (!file) {
        const notFound = join(root, '404.html');
        const body = existsSync(notFound) ? notFound : null;
        response.writeHead(404, {
            'content-type': 'text/html; charset=utf-8',
        });
        if (body) createReadStream(body).pipe(response);
        else response.end('Not found');
        return;
    }

    response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'content-length': statSync(file).size,
        // A published host sets a real policy; the suite only needs the
        // measurement to see a cacheable, immutable-safe response.
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
    });
    createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
    console.log(`serve-published: ${root} on http://127.0.0.1:${port}`);
});
