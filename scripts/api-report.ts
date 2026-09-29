/** API snapshot generator — `pnpm api:report`. */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderDeclarationReport } from './api-report/dts.mjs';
import { STATE_INVENTORY } from '../packages/core/src/lib/state/state-inventory.ts';
import { CSS_VAR_MAP } from '../packages/core/src/lib/theme/cssVarMap.ts';
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

/** Publishable packages, in a stable order. */
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
    { name: '@triiiceratops/plugin-av', dir: 'plugin-av' },
];

/** Slug for a package's declaration-report filename. */
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

// ── Build the declaration inputs ──
function buildDeclarations(): void {
    const run = (args: string) =>
        execSync(`pnpm ${args}`, { cwd: REPO, stdio: 'inherit' });
    // Core first — plugins emit against core's built `dist` types.
    run('--filter triiiceratops build:lib');
    run('--filter triiiceratops build:testing');
    run('--filter @triiiceratops/plugin-sdk build');
    run('--filter @triiiceratops/plugin-image-manipulation build:types');
    run('--filter @triiiceratops/plugin-image-export build:types');
    run('--filter @triiiceratops/plugin-pdf-export build:types');
    run('--filter @triiiceratops/plugin-annotation-editor build:types');
    run('--filter @triiiceratops/plugin-av build:types');
}

// ── Per-package declaration reports ──
function emitDeclarationReports(): void {
    for (const pkg of PACKAGES) {
        const report = renderDeclarationReport(pkgDir(pkg.dir), pkg.name);
        writeFileSync(resolve(OUT, `${slug(pkg.name)}.api.md`), report);
    }
}

// ── Per-package exports map ──
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

// ── State inventory ──
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

// ── Public CSS tokens ──
function emitCssTokens(): void {
    const keyByVar = new Map(
        Object.entries(CSS_VAR_MAP).map(([key, token]) => [token.cssVar, key]),
    );
    writeFileSync(
        resolve(OUT, 'css-tokens.json'),
        stableJson({
            prefix: '--tri-',
            count: PUBLIC_TOKENS.length,
            tokens: PUBLIC_TOKENS.map((t) => ({
                name: t.name,
                category: t.category,
                themeConfigKey: keyByVar.get(t.name) ?? null,
            })),
        }),
    );
}

// ── Plugin API version + capability vocabulary ──
function emitPluginApi(): void {
    writeFileSync(
        resolve(OUT, 'plugin-api.json'),
        stableJson({
            pluginApiVersion,
            capabilities: [...capabilities].sort(),
        }),
    );
}

/** Member-signature lines of a named interface body. */
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

// ── Browser runtime shape + capabilities ──
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
            // Semver-governed capability list. Empty in the 1.0 line: the
            // renderer capability was retired with no successor, and core’s own
            // surface is negotiated through `coreRange` (see plugin/api.ts).
            capabilities: [...capabilities].sort(),
            pluginApiVersion,
        }),
    );
}

// ── Custom-element properties / methods / events ──
function emitCustomElement(): void {
    const elSrc = readFileSync(
        resolve(CORE_SRC, 'lib/components/TriiiceratopsViewerElement.svelte'),
        'utf8',
    );

    const tableSrc = readFileSync(
        resolve(CORE_SRC, 'lib/components/viewerElement.svelte.ts'),
        'utf8',
    );
    const tableStart = tableSrc.indexOf('ELEMENT_PROPS');
    const propsBlock = tableSrc.slice(
        tableStart,
        tableSrc.indexOf('\n};', tableStart),
    );
    const callbackProps = ['onpluginerror', 'onviewererror'].filter((p) =>
        elSrc.includes(p),
    );
    // Property-only inputs carry non-serializable values; the attribute is inert.
    const PROPERTY_ONLY_INPUTS = new Set(['searchProvider', 'plugins']);
    const PROPERTY_ONLY_NOTE =
        'INERT. The element observes an attribute for every declared prop, ' +
        'but this input carries a non-serializable value: the PROPERTY is the ' +
        'only supported channel. Do not wire the attribute up.';
    const attrProps: Array<{
        property: string;
        attribute: string;
        type: string;
        reflect: boolean;
        attributeSupported?: false;
        attributeNote?: string;
    }> = [];
    const entryRe =
        /(\w+):\s*\{\s*attribute:\s*'([^']+)',\s*type:\s*'([^']+)',\s*reflect:\s*(true|false)/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(propsBlock))) {
        if (callbackProps.includes(m[1])) continue;
        attrProps.push({
            property: m[1],
            attribute: m[2],
            type: m[3],
            reflect: m[4] === 'true',
            ...(PROPERTY_ONLY_INPUTS.has(m[1])
                ? {
                      attributeSupported: false as const,
                      attributeNote: PROPERTY_ONLY_NOTE,
                  }
                : {}),
        });
    }

    const readonlyProps: string[] = [];
    const exportRe = /export\s*\{\s*\w+\s+as\s+(\w+)\s*\}/g;
    while ((m = exportRe.exec(elSrc))) {
        readonlyProps.push(m[1]);
    }

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
