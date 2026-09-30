/*
 * Proves two builds of the element render identically: loads each ESM element
 * artifact in Chromium across fixed scenarios, walks every shadow element
 * (nested shadow roots and ::before/::after included) and diffs their settled
 * computed styles.
 *
 * Run: `node ./scripts/compare-element-styles.mjs <baseline.js> <candidate.js>
 * [--port N] [--allow <name>...]`.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const MANIFEST = fileURLToPath(
    new URL(
        '../../../test-consumers/shared/local-manifest.json',
        import.meta.url,
    ),
);
const MAX_LISTED = 30;
const NORMALIZATIONS = [
    'custom-prop-whitespace',
    'transform-origin-zero',
    'webkit-aliases',
    'svg-path-d',
];

const SCENARIOS = [
    { name: 'default' },
    {
        name: 'dark-panels-open',
        theme: 'dark',
        config: {
            toolbarOpen: true,
            gallery: { open: true },
            information: { open: true },
            search: { open: true, query: 'x' },
        },
    },
    {
        name: 'teal-docked-nav',
        theme: 'teal',
        config: {
            toolbarOpen: true,
            nav: { style: 'docked', edge: 'top', align: 'start' },
            gallery: { open: true, dockPosition: 'bottom' },
            annotations: { open: true },
            structures: { open: true },
        },
    },
    {
        name: 'dracula-mobile',
        theme: 'dracula',
        viewport: { width: 390, height: 800 },
        config: {
            toolbarOpen: true,
            viewingMode: 'paged',
            gallery: { open: true, dockPosition: 'left' },
        },
    },
    {
        name: 'theme-config',
        theme: 'dark',
        themeConfig: {
            primary: '#3b82f6',
            panelBg: '#1e1e2e',
            radiusBox: '0.75rem',
            border: '2px',
            metadataPanelContent: 'red',
            annotationPointSize: '12px',
            colorScheme: 'light',
            cssVars: { '--ui-gap': '9px' },
        },
        config: { toolbarOpen: true, information: { open: true } },
    },
];

function parseArgs(argv) {
    const files = [];
    const allow = new Set();
    let port = 5298;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--port') {
            port = Number(argv[++i]);
        } else if (arg === '--allow') {
            while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
                allow.add(argv[++i]);
            }
        } else {
            files.push(arg);
        }
    }
    const unknown = [...allow].filter((n) => !NORMALIZATIONS.includes(n));
    if (files.length !== 2 || !Number.isInteger(port) || unknown.length) {
        if (unknown.length) {
            console.error(`Unknown --allow: ${unknown.join(', ')}`);
        }
        console.error(
            'Usage: compare-element-styles.mjs <baseline.js> <candidate.js> ' +
                `[--port N] [--allow ${NORMALIZATIONS.join('|')}...]`,
        );
        process.exit(2);
    }
    return { files, port, allow };
}

function escapeAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function pageHtml(artifact, scenario) {
    const attrs = ['manifest-id="/manifest.json"'];
    if (scenario.theme) attrs.push(`theme="${scenario.theme}"`);
    if (scenario.config) {
        attrs.push(`config="${escapeAttr(JSON.stringify(scenario.config))}"`);
    }
    if (scenario.themeConfig) {
        attrs.push(
            `theme-config="${escapeAttr(JSON.stringify(scenario.themeConfig))}"`,
        );
    }
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>html,body{margin:0;height:100%}triiiceratops-viewer{display:block;height:100%}</style>
<script type="module" src="/${artifact}"></script>
</head>
<body><triiiceratops-viewer ${attrs.join(' ')}></triiiceratops-viewer></body>
</html>`;
}

function serve(root, port, artifacts) {
    const server = createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.slice(1);
        if (name === 'page.html') {
            const scenario = SCENARIOS[Number(url.searchParams.get('s'))];
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(pageHtml(url.searchParams.get('a'), scenario));
            return;
        }
        const type = name.endsWith('.json')
            ? 'application/json'
            : 'text/javascript';
        if (name !== 'manifest.json' && !artifacts.includes(name)) {
            res.statusCode = 404;
            res.end();
            return;
        }
        res.setHeader('Content-Type', `${type}; charset=utf-8`);
        res.end(readFileSync(path.join(root, name)));
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

function snapshotShadow() {
    const HASH_CLASS = /^(svelte-[a-z0-9]+|_[0-9a-z]{1,3})$/;
    const IGNORED = /^(transition|animation)/;
    const out = {};

    function styles(el, pseudo) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) {
            return null;
        }
        const props = {};
        for (let i = 0; i < cs.length; i++) {
            const name = cs[i];
            if (IGNORED.test(name)) continue;
            props[name] = cs.getPropertyValue(name);
        }
        return props;
    }

    function walk(parent, prefix) {
        const counts = {};
        for (const el of parent.children) {
            const tag = el.localName;
            if (tag === 'style') continue;
            counts[tag] = (counts[tag] ?? 0) + 1;
            const key = `${prefix}/${tag}[${counts[tag]}]`;
            const props = styles(el);
            props.class = [...el.classList]
                .filter((c) => !HASH_CLASS.test(c))
                .sort()
                .join(' ');
            out[key] = props;
            for (const pseudo of ['::before', '::after']) {
                const p = styles(el, pseudo);
                if (p) out[`${key}${pseudo}`] = p;
            }
            if (el.shadowRoot) walk(el.shadowRoot, `${key}/#shadow`);
            walk(el, key);
        }
    }

    const host = document.querySelector('triiiceratops-viewer');
    if (!host?.shadowRoot) throw new Error('element has no shadow root');
    walk(host.shadowRoot, '#shadow');
    return out;
}

async function capture(browser, baseURL, artifact, index) {
    const scenario = SCENARIOS[index];
    const page = await browser.newPage({
        viewport: scenario.viewport ?? { width: 1400, height: 900 },
    });
    try {
        await page.goto(`${baseURL}/page.html?a=${artifact}&s=${index}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForFunction(
            () =>
                document.querySelector('triiiceratops-viewer')?.shadowRoot
                    ?.childElementCount > 0,
        );
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
        );
        return await page.evaluate(snapshotShadow);
    } finally {
        await page.close();
    }
}

function normalizeValue(name, value, allow) {
    if (allow.has('custom-prop-whitespace') && name.startsWith('--')) {
        return value
            .replace(/\s+/g, ' ')
            .replace(/\s*([,()/])\s*/g, '$1')
            .trim();
    }
    if (allow.has('transform-origin-zero') && name === 'transform-origin') {
        return value.replace(/(^|\s)0%(?=\s|$)/g, '$10px');
    }
    return value;
}

function isAllowedDiff(key, name, a, b, allow) {
    if (allow.has('svg-path-d') && name === 'd' && /\/path\[\d+\]$/.test(key)) {
        return true;
    }
    if (allow.has('webkit-aliases') && name.startsWith('-webkit-')) {
        const plain = name.slice('-webkit-'.length);
        if (plain in a && plain in b && a[plain] === b[plain]) return true;
    }
    return false;
}

function diff(scenario, baseline, candidate, allow) {
    const diffs = [];
    const keys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
    for (const key of keys) {
        const at = `${scenario} ${key}`;
        const a = baseline[key];
        const b = candidate[key];
        if (!a || !b) {
            diffs.push({
                at,
                name: '(element)',
                a: a ? 'present' : 'missing',
                b: b ? 'present' : 'missing',
            });
            continue;
        }
        const names = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const name of names) {
            const va = normalizeValue(name, a[name] ?? '(unset)', allow);
            const vb = normalizeValue(name, b[name] ?? '(unset)', allow);
            if (va === vb || isAllowedDiff(key, name, a, b, allow)) continue;
            diffs.push({ at, name, a: va, b: vb });
        }
    }
    return diffs;
}

const { files, port, allow } = parseArgs(process.argv.slice(2));
const root = mkdtempSync(path.join(tmpdir(), 'compare-element-styles-'));
const artifacts = ['baseline.js', 'candidate.js'];
copyFileSync(path.resolve(files[0]), path.join(root, artifacts[0]));
copyFileSync(path.resolve(files[1]), path.join(root, artifacts[1]));
copyFileSync(MANIFEST, path.join(root, 'manifest.json'));

let server;
let browser;
let exitCode = 1;
try {
    server = await serve(root, port, artifacts);
    browser = await chromium.launch();
    const baseURL = `http://127.0.0.1:${port}`;
    const all = [];
    for (let i = 0; i < SCENARIOS.length; i++) {
        const [a, b] = await Promise.all(
            artifacts.map((artifact) => capture(browser, baseURL, artifact, i)),
        );
        const diffs = diff(SCENARIOS[i].name, a, b, allow);
        console.log(
            `${SCENARIOS[i].name}: ${Object.keys(a).length} entries, ${diffs.length} differences`,
        );
        all.push(...diffs);
    }
    for (const d of all.slice(0, MAX_LISTED)) {
        console.log(`  ${d.at}  ${d.name}: ${d.a} → ${d.b}`);
    }
    if (all.length > MAX_LISTED) {
        console.log(`  … ${all.length - MAX_LISTED} more`);
    }
    console.log(`Total differences: ${all.length}`);
    exitCode = all.length === 0 ? 0 : 1;
} catch (error) {
    console.error(error);
} finally {
    await browser?.close();
    server?.closeAllConnections();
    await new Promise((resolve) =>
        server ? server.close(resolve) : resolve(),
    );
    rmSync(root, { recursive: true, force: true });
}
process.exit(exitCode);
