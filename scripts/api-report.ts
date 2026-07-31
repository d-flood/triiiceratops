/**
 * API snapshot generator (ticket 21) — `pnpm api:report`.
 *
 * Regenerates every machine-readable public-contract snapshot under
 * `api-reports/`, so a contract change shows up as a reviewable diff and CI can
 * fail on uncommitted drift (see `.github/workflows/test.yml` → `api-report`).
 *
 * Snapshots (one file per surface):
 *   - `<pkg>.api.md`          per-package public declaration report (d.ts rollup)
 *   - `exports.json`          per-package `exports` map (+ main/module/types/…)
 *   - `custom-element.json`   custom-element properties / methods / events
 *   - `browser-runtime.json`  `TriiiceratopsBrowserRuntime` shape + capabilities
 *   - `plugin-api.json`       plugin API version + capability vocabulary
 *   - `css-tokens.json`       public `--tri-*` CSS token list (ticket 19)
 *   - `state-inventory.json`  state inventory (member + classification + commands)
 *
 * Declaration mechanism: d.ts snapshot (reachability rollup), NOT api-extractor
 * — one mechanism, per ticket 21. Non-TS surfaces are simple JSON snapshots.
 *
 * Determinism: run twice → no diff. The value/shape snapshots are read from the
 * checked-in source of truth (state inventory, public tokens, plugin/api
 * constants, package.json). The declaration reports are read from freshly built
 * `dist` — so this script builds the needed `.d.ts` first (unless `--no-build`).
 * The concrete `coreVersion` string is intentionally NOT snapshotted (it changes
 * every release); the browser-runtime snapshot records its shape + the
 * semver-governed capability list instead.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDeclarationReport } from './api-report/dts.mjs';
import { STATE_INVENTORY } from '../packages/core/src/lib/state/state-inventory.ts';
import { PUBLIC_TOKENS } from '../packages/core/src/lib/theme/publicTokens.ts';
import {
    pluginApiVersion,
    capabilities,
} from '../packages/core/src/lib/plugin/api.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = resolve(REPO, 'api-reports');
const CORE_SRC = resolve(REPO, 'packages/core/src');

const noBuild = process.argv.includes('--no-build');

/** Publishable packages, in a stable order. `dir` is the package directory name. */
const PACKAGES = [
    { name: 'triiiceratops', dir: 'core' },
    { name: '@triiiceratops/plugin-sdk', dir: 'plugin-sdk' },
    {
        name: '@triiiceratops/plugin-image-manipulation',
        dir: 'plugin-image-manipulation',
    },
    {
        name: '@triiiceratops/plugin-image-export',
        dir: 'plugin-image-export',
    },
    { name: '@triiiceratops/plugin-pdf-export', dir: 'plugin-pdf-export' },
    {
        name: '@triiiceratops/plugin-annotation-editor',
        dir: 'plugin-annotation-editor',
    },
];

/** Slug used for a package's declaration-report filename. */
function slug(name: string): string {
    return name
        .replace('@triiiceratops/', '')
        .replace(/^triiiceratops$/, 'core');
}

function pkgDir(dir: string): string {
    return resolve(REPO, 'packages', dir);
}

function stableJson(value: unknown): string {
    return JSON.stringify(value, null, 4) + '\n';
}

// ── Build the declaration inputs (fresh dist `.d.ts`) ───────────────────────
function buildDeclarations(): void {
    const run = (args: string) =>
        execSync(`pnpm ${args}`, { cwd: REPO, stdio: 'inherit' });
    // Core first — plugins type-check/emit against core's built `dist` types.
    run('--filter triiiceratops build:lib');
    run('--filter triiiceratops build:testing');
    run('--filter @triiiceratops/plugin-sdk build');
    run('--filter @triiiceratops/plugin-image-manipulation build:types');
    run('--filter @triiiceratops/plugin-image-export build:types');
    run('--filter @triiiceratops/plugin-pdf-export build:types');
    run('--filter @triiiceratops/plugin-annotation-editor build:types');
}

// ── Per-package declaration reports (d.ts rollup) ───────────────────────────
function emitDeclarationReports(): void {
    for (const pkg of PACKAGES) {
        const report = renderDeclarationReport(pkgDir(pkg.dir), pkg.name);
        writeFileSync(resolve(OUT, `${slug(pkg.name)}.api.md`), report);
    }
}

// ── Per-package exports map ─────────────────────────────────────────────────
function emitExports(): void {
    const map: Record<string, unknown> = {};
    for (const pkg of PACKAGES) {
        const json = JSON.parse(
            readFileSync(resolve(pkgDir(pkg.dir), 'package.json'), 'utf8'),
        );
        map[pkg.name] = {
            main: json.main ?? null,
            module: json.module ?? null,
            svelte: json.svelte ?? null,
            types: json.types ?? null,
            style: json.style ?? null,
            sideEffects: json.sideEffects ?? null,
            exports: json.exports ?? null,
        };
    }
    writeFileSync(resolve(OUT, 'exports.json'), stableJson(map));
}

// ── State inventory (member + classification + commands) ────────────────────
function emitStateInventory(): void {
    const entries = STATE_INVENTORY.map((e) => ({
        member: e.member,
        classification: e.classification,
        commands: e.commands ?? null,
    })).sort((a, b) => a.member.localeCompare(b.member));
    writeFileSync(
        resolve(OUT, 'state-inventory.json'),
        stableJson({
            count: entries.length,
            byClassification: {
                command: entries.filter((e) => e.classification === 'command')
                    .length,
                observable: entries.filter(
                    (e) => e.classification === 'observable',
                ).length,
                internal: entries.filter((e) => e.classification === 'internal')
                    .length,
                'query-only': entries.filter(
                    (e) => e.classification === 'query-only',
                ).length,
            },
            entries,
        }),
    );
}

// ── Public CSS tokens (ticket 19) ───────────────────────────────────────────
function emitCssTokens(): void {
    writeFileSync(
        resolve(OUT, 'css-tokens.json'),
        stableJson({
            prefix: '--tri-',
            count: PUBLIC_TOKENS.length,
            tokens: PUBLIC_TOKENS.map((t) => ({
                name: t.name,
                category: t.category,
            })),
        }),
    );
}

// ── Plugin API version + capability vocabulary ──────────────────────────────
function emitPluginApi(): void {
    writeFileSync(
        resolve(OUT, 'plugin-api.json'),
        stableJson({
            pluginApiVersion,
            capabilities: [...capabilities].sort(),
        }),
    );
}

/**
 * Extract the member-signature lines of a named `interface`/`declare namespace`
 * body from a source file (comments stripped, whitespace collapsed).
 */
function interfaceMembers(fileText: string, name: string): string[] {
    const start = fileText.indexOf(`interface ${name}`);
    if (start === -1) return [];
    const open = fileText.indexOf('{', start);
    let depth = 0;
    let end = open;
    for (let i = open; i < fileText.length; i++) {
        if (fileText[i] === '{') depth++;
        else if (fileText[i] === '}') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    const body = fileText
        .slice(open + 1, end)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
    return body
        .split(/[;\n]/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

// ── Browser runtime shape + capabilities ────────────────────────────────────
function emitBrowserRuntime(): void {
    const src = readFileSync(
        resolve(CORE_SRC, 'lib/browser-runtime.ts'),
        'utf8',
    );
    writeFileSync(
        resolve(OUT, 'browser-runtime.json'),
        stableJson({
            globalKey: 'Triiiceratops',
            elementTag: 'triiiceratops-viewer',
            interfaces: {
                TriiiceratopsBrowserRuntime: interfaceMembers(
                    src,
                    'TriiiceratopsBrowserRuntime',
                ),
                PluginFactoryRegistry: interfaceMembers(
                    src,
                    'PluginFactoryRegistry',
                ),
            },
            // Semver-governed capability list (must include `osd@5`).
            capabilities: [...capabilities].sort(),
            pluginApiVersion,
        }),
    );
}

// ── Custom-element properties / methods / events ────────────────────────────
function emitCustomElement(): void {
    const elSrc = readFileSync(
        resolve(CORE_SRC, 'lib/components/TriiiceratopsViewerElement.svelte'),
        'utf8',
    );

    // Attribute-backed properties from the `<svelte:options customElement props>`.
    const propsBlock = elSrc.slice(
        elSrc.indexOf('props: {'),
        elSrc.indexOf('},\n    }}'),
    );
    // Property-only inputs: declared as props so Svelte defines a prototype
    // accessor and ports a pre-upgrade assignment, but the observed attribute
    // Svelte derives from the declaration is INERT and unsupported. Recorded so
    // a future contributor does not wire the attribute up.
    const PROPERTY_ONLY_INPUTS = new Set(['searchProvider', 'plugins']);
    const attrProps: Array<{
        property: string;
        attribute: string;
        type: string;
        reflect: boolean;
        attributeSupported?: false;
    }> = [];
    const entryRe =
        /(\w+):\s*\{\s*attribute:\s*'([^']+)',\s*type:\s*'([^']+)',\s*reflect:\s*(true|false)/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(propsBlock))) {
        attrProps.push({
            property: m[1],
            attribute: m[2],
            type: m[3],
            reflect: m[4] === 'true',
            ...(PROPERTY_ONLY_INPUTS.has(m[1])
                ? { attributeSupported: false as const }
                : {}),
        });
    }

    // JS-only callback properties (no attribute) exposed on the element.
    const callbackProps = ['onpluginerror', 'onviewererror'].filter((p) =>
        elSrc.includes(p),
    );

    // Getter-only properties the Svelte compiler emits from instance exports
    // (`create_custom_element`'s `exports`). These live on the constructor's
    // prototype with no setter — the state bridge, and the version handshake a
    // framework wrapper probes.
    const readonlyProps: string[] = [];
    const exportRe = /export\s*\{\s*\w+\s+as\s+(\w+)\s*\}/g;
    while ((m = exportRe.exec(elSrc))) {
        readonlyProps.push(m[1]);
    }

    // Events. The state-change family is derived from the dispatch call sites in
    // ViewerState; `pluginerror`/`viewererror` from their event-name constants.
    const viewerSrc = readFileSync(
        resolve(CORE_SRC, 'lib/state/viewer.svelte.ts'),
        'utf8',
    );
    const stateEvents = new Set<string>();
    const dispatchRe = /dispatchStateChange\(\s*(?:'([^']+)')?\s*\)/g;
    while ((m = dispatchRe.exec(viewerSrc))) {
        stateEvents.add(m[1] ?? 'statechange');
    }
    const pluginEvent = /PLUGIN_ERROR_EVENT\s*=\s*'([^']+)'/.exec(
        readFileSync(resolve(CORE_SRC, 'lib/types/plugin.ts'), 'utf8'),
    );
    const viewerEvent = /VIEWER_ERROR_EVENT\s*=\s*'([^']+)'/.exec(
        readFileSync(resolve(CORE_SRC, 'lib/types/viewerError.ts'), 'utf8'),
    );
    const stateAvailableEvent =
        /VIEWER_STATE_AVAILABLE_EVENT\s*=\s*'([^']+)'/.exec(
            readFileSync(
                resolve(CORE_SRC, 'lib/types/viewerElement.ts'),
                'utf8',
            ),
        );

    const events = [
        ...[...stateEvents].sort().map((name) => ({
            name,
            detail: 'ViewerStateSnapshot',
            bubbles: true,
            composed: true,
        })),
    ];
    if (pluginEvent) {
        events.push({
            name: pluginEvent[1],
            detail: 'PluginError',
            bubbles: true,
            composed: true,
        });
    }
    if (viewerEvent) {
        events.push({
            name: viewerEvent[1],
            detail: 'ViewerError',
            bubbles: true,
            composed: true,
        });
    }
    if (stateAvailableEvent) {
        events.push({
            name: stateAvailableEvent[1],
            detail: 'ViewerState',
            bubbles: true,
            composed: true,
        });
    }
    events.sort((a, b) => a.name.localeCompare(b.name));

    writeFileSync(
        resolve(OUT, 'custom-element.json'),
        stableJson({
            tag: 'triiiceratops-viewer',
            shadow: 'open',
            properties: attrProps.sort((a, b) =>
                a.property.localeCompare(b.property),
            ),
            callbackProperties: callbackProps.sort(),
            readonlyProperties: readonlyProps.sort(),
            // The Svelte-compiled custom element exposes no imperative methods
            // beyond the standard HTMLElement surface; properties are the API.
            methods: [],
            events,
        }),
    );
}

function main(): void {
    mkdirSync(OUT, { recursive: true });
    if (!noBuild) buildDeclarations();
    emitExports();
    emitStateInventory();
    emitCssTokens();
    emitPluginApi();
    emitBrowserRuntime();
    emitCustomElement();
    emitDeclarationReports();

    console.log(`API snapshots written to ${OUT}`);
}

main();
