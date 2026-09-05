#!/usr/bin/env node
// `pnpm cms`: start the development server and list every page's editor.
//
// The editor routes exist only on a development server, and their URLs are not
// linked from anywhere in the site — an author who does not already know the
// `/edit/` convention has nothing to click. This prints the whole editable
// surface, then hands the terminal to `pnpm dev`.

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const CONTENT = join(REPO_ROOT, 'apps', 'site', 'content');
const DEFAULT_PORT = 5173;

function fail(message) {
    console.error(`cms: ${message}`);
    process.exit(1);
}

/** Every content document, as a path relative to `content/`. */
function documents(dir = CONTENT) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...documents(full));
        else if (entry.name.endsWith('.json'))
            out.push(relative(CONTENT, full));
    }
    return out;
}

/**
 * A document's route, through Uncial's default mapping: `handles.json` is
 * `/handles/`, `docs/react.json` is `/docs/react/`, and `index.json` is the
 * site root rather than `/index/`.
 */
function routeOf(document) {
    const stem = document.slice(0, -'.json'.length).split(sep).join('/');
    return stem === 'index' ? '/' : `/${stem}/`;
}

function parsePort(argv) {
    const flag = argv.indexOf('--port');
    if (flag === -1) return DEFAULT_PORT;
    const port = Number(argv[flag + 1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        fail(
            `--port needs a port number, got ${argv[flag + 1] ?? '(nothing)'}`,
        );
    return port;
}

function list(origin, heading, routes) {
    if (routes.length === 0) return;
    console.log(`\n${heading}`);
    for (const route of routes) console.log(`  ${origin}${route}edit/`);
}

function main() {
    const port = parsePort(process.argv.slice(2));
    // 127.0.0.1 rather than localhost, and the same host Vite announces: where
    // localhost resolves to ::1 first, these URLs would not reach a server Vite
    // has bound to the IPv4 loopback alone.
    const origin = `http://127.0.0.1:${port}`;

    let routes;
    try {
        routes = documents().map(routeOf).sort();
    } catch (error) {
        fail(`could not read ${CONTENT}: ${error.message}`);
    }
    if (routes.length === 0) fail(`no content documents under ${CONTENT}`);

    const isDocs = (route) => route.startsWith('/docs');
    list(
        origin,
        'Pages',
        routes.filter((route) => !isDocs(route)),
    );
    list(origin, 'Documentation', routes.filter(isDocs));
    console.log(
        '\nEdits save to apps/site/content/ as you type. Ctrl-C to stop.\n',
    );

    // strictPort so the URLs above are the ones actually served: Vite's silent
    // hop to the next free port would leave every line here wrong.
    const dev = spawn(
        'pnpm',
        [
            '--filter',
            '@triiiceratops/app-site',
            'dev',
            '--port',
            String(port),
            '--strictPort',
        ],
        { stdio: 'inherit', cwd: REPO_ROOT },
    );
    dev.on('error', (error) =>
        fail(`could not start the development server: ${error.message}`),
    );
    dev.on('exit', (code) => process.exit(code ?? 1));
}

main();
