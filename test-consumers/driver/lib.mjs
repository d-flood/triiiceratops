// Shared helpers for the packed-consumer test harness driver.
import { spawn } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_DIR = resolve(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
);
export const REPO_ROOT = resolve(HARNESS_DIR, '..');
export const FIXTURES_DIR = join(HARNESS_DIR, 'fixtures');
export const SHARED_DIR = join(HARNESS_DIR, 'shared');

// --- logging ---------------------------------------------------------------

const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};

export function log(msg) {
    process.stdout.write(`${msg}\n`);
}
export function step(msg) {
    log(`${c.dim}  · ${msg}${c.reset}`);
}
export function heading(msg) {
    log(`\n${c.bold}${msg}${c.reset}`);
}
export function pass(label, detail = '') {
    log(
        `${c.green}PASS${c.reset} ${label}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`,
    );
}
export function fail(label, detail = '') {
    log(
        `${c.red}FAIL${c.reset} ${label}${detail ? ` ${c.dim}${detail}${c.reset}` : ''}`,
    );
}

// --- process running -------------------------------------------------------

/**
 * Run a command to completion. Rejects on non-zero exit. Captures output so
 * failures can surface a tail of the log.
 */
export function run(cmd, args, opts = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(cmd, args, {
            cwd: opts.cwd,
            env: { ...process.env, ...opts.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d.toString()));
        child.stderr.on('data', (d) => (out += d.toString()));
        const timer = opts.timeout
            ? setTimeout(() => {
                  child.kill('SIGKILL');
                  reject(
                      new Error(
                          `Timed out after ${opts.timeout}ms: ${cmd} ${args.join(' ')}`,
                      ),
                  );
              }, opts.timeout)
            : null;
        child.on('error', (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            if (timer) clearTimeout(timer);
            if (code === 0) resolvePromise(out);
            else {
                const tail = out.split('\n').slice(-40).join('\n');
                reject(
                    new Error(
                        `Command failed (exit ${code}): ${cmd} ${args.join(' ')}\n${tail}`,
                    ),
                );
            }
        });
    });
}

// --- filesystem ------------------------------------------------------------

export function makeTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
}

/** Copy a fixture template into a fresh temp dir, excluding build/install junk. */
export function copyFixture(fixtureName, destRoot) {
    const src = join(FIXTURES_DIR, fixtureName);
    const dest = join(destRoot, fixtureName);
    cpSync(src, dest, {
        recursive: true,
        filter: (p) => {
            const rel = p.slice(src.length);
            return (
                !rel.includes('node_modules') &&
                !rel.includes('.svelte-kit') &&
                !rel.includes(`${'/'}dist`) &&
                !rel.includes(`${'/'}build`) &&
                !rel.endsWith('.tgz')
            );
        },
    });
    return dest;
}

/** Stable vendored tarball filename for a (possibly scoped) package name. */
export function vendoredTarballName(depName) {
    return `${depName.replace(/[@/]/g, '_')}.tgz`;
}

/**
 * Point a fixture dependency at the freshly packed tarball, vendored to a stable
 * relative path so the committed lockfile stays valid except for the tarball's
 * own integrity hash. `depName` defaults to `triiiceratops`; pass the scoped
 * name (e.g. `@triiiceratops/plugin-sdk`) to inject additional packed packages.
 */
export function injectTarball(fixtureDir, tarballPath, depName = 'triiiceratops') {
    const vendorDir = join(fixtureDir, 'vendor');
    mkdirSync(vendorDir, { recursive: true });
    const fileName = vendoredTarballName(depName);
    const vendored = join(vendorDir, fileName);
    cpSync(tarballPath, vendored);
    const pkgPath = join(fixtureDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies[depName] = `file:./vendor/${fileName}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
}

/**
 * Remove the locally-packed dependency's resolved node from committed lockfiles
 * so the package manager re-resolves the FRESHLY vendored tarball instead of a
 * stale, integrity-cached copy.
 *
 * Committed lockfiles pin third-party deps for determinism — but a committed
 * `file:` integrity would make npm restore whatever content it cached under that
 * hash, defeating the "inject the fresh tarball" contract. Third-party entries
 * are left untouched; only the local package's node is dropped and re-resolved.
 */
export function refreshLocalDepInLockfiles(fixtureDir, depName) {
    // npm: package-lock.json (lockfileVersion 2/3)
    const npmLock = join(fixtureDir, 'package-lock.json');
    if (existsSync(npmLock)) {
        const json = JSON.parse(readFileSync(npmLock, 'utf8'));
        if (json.packages) delete json.packages[`node_modules/${depName}`];
        if (json.dependencies) delete json.dependencies[depName];
        writeFileSync(npmLock, JSON.stringify(json, null, 2) + '\n');
    }
    // pnpm re-reads the on-disk tarball on a non-frozen install, so its lockfile
    // needs no surgery — but drop a byte-stale importer spec if present so the
    // fresh tarball always wins.
    // (pnpm-lock.yaml is left as-is; --no-frozen-lockfile reconciles it.)
}

export function distributeManifest(fixtureDir, target) {
    if (!target) return;
    const dest = join(fixtureDir, target);
    mkdirSync(resolve(dest, '..'), { recursive: true });
    cpSync(join(SHARED_DIR, 'local-manifest.json'), dest);
}

// --- static file server ----------------------------------------------------

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.map': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
};

/**
 * Serve a directory over HTTP on an ephemeral port. Returns { baseURL, close }.
 * SPA-style: unknown paths without an extension fall back to index.html.
 */
export function serveDir(rootDir) {
    return new Promise((resolvePromise) => {
        const server = createServer((req, res) => {
            try {
                const url = new URL(req.url, 'http://localhost');
                let pathname = decodeURIComponent(url.pathname);
                if (pathname.endsWith('/')) pathname += 'index.html';
                let filePath = join(rootDir, pathname);
                let body;
                try {
                    body = readFileSync(filePath);
                } catch {
                    if (!extname(pathname)) {
                        filePath = join(rootDir, 'index.html');
                        body = readFileSync(filePath);
                    } else {
                        res.statusCode = 404;
                        res.end('Not found');
                        return;
                    }
                }
                res.setHeader(
                    'Content-Type',
                    MIME[extname(filePath)] || 'application/octet-stream',
                );
                res.end(body);
            } catch {
                res.statusCode = 500;
                res.end('Server error');
            }
        });
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolvePromise({
                baseURL: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((r) => server.close(() => r(undefined))),
            });
        });
    });
}

// Headless Chromium has no real GPU, so OpenSeadragon's WebGL drawer can emit
// environment-specific context/param warnings (e.g. MAX_TEXTURE_IMAGE_UNITS
// null). These are not consumer-facing defects in the packed artifact — the
// canvas still renders — so they are filtered from the page-error assertion.
const BENIGN_BROWSER_ERROR =
    /webgl|gl parameter|swiftshader|graphics card|too many contexts/i;

export function isBenignBrowserError(text) {
    return BENIGN_BROWSER_ERROR.test(text);
}

export function cleanup(dir) {
    try {
        rmSync(dir, { recursive: true, force: true });
    } catch {
        /* best effort */
    }
}
