/**
 * The builder's handoffs, as text.
 *
 * A reader leaves this page with a share URL, the configuration and theming
 * objects on their own, or a snippet for the framework they build in. All of
 * them are produced from the same state the preview above is running, so what
 * a reader copies cannot disagree with what they are looking at.
 *
 * Every snippet follows the guide that documents the same framework, and
 * `tests/unit/builder-outputs.test.ts` reads the entry point out of that guide,
 * so a renamed entry point fails the suite rather than shipping a paste that
 * resolves to nothing. The reason this matters is on the other side of the
 * argument: `mkiiif`'s generated pages carry a hand-written configuration whose
 * keys went stale, and nothing told anyone.
 */

import type { SparseConfig } from '@triiiceratops/config';

import { PACKAGE_NAME } from '../install';
import type { BuilderPlugin } from './plugins';

export type FrameworkId = 'html' | 'react' | 'vue' | 'svelte';

export type Framework = {
    readonly id: FrameworkId;
    readonly label: string;
    /** The documentation page whose form the snippet follows. */
    readonly doc: string;
    readonly href: string;
    /** The import specifier or tag the guide and the snippet must agree on. */
    readonly entry: string;
    /**
     * The grammar the snippet is highlighted by, named from the same
     * vocabulary the content documents declare — `tests/unit/docs-content.test.ts`
     * lists it. A Svelte component is `html` there because that vocabulary has
     * one spelling per language and Svelte and HTML highlight identically.
     */
    readonly language: string;
};

/**
 * No build step first: it is the shortest snippet and the one that needs no
 * argument about tooling, and it is the form a content system can host.
 */
export const FRAMEWORKS: readonly Framework[] = [
    {
        id: 'html',
        label: 'HTML',
        doc: 'integration',
        href: '/docs/integration/',
        entry: '<triiiceratops-viewer',
        language: 'html',
    },
    {
        id: 'react',
        label: 'React',
        doc: 'react',
        href: '/docs/react/',
        entry: `${PACKAGE_NAME}/react`,
        language: 'jsx',
    },
    {
        id: 'vue',
        label: 'Vue',
        doc: 'vue',
        href: '/docs/vue/',
        entry: `${PACKAGE_NAME}/vue`,
        language: 'vue',
    },
    {
        id: 'svelte',
        label: 'Svelte',
        doc: 'svelte',
        href: '/docs/svelte/',
        entry: `${PACKAGE_NAME}/svelte`,
        language: 'html',
    },
];

/**
 * What the builder has to hand off: the material, the two sparse overlays, and
 * the plugins the reader turned on.
 *
 * The plugins are the one part that is not data. A plugin is a module, so it
 * cannot travel in a configuration object or a query string — only a snippet
 * can carry it, which is why it arrives here rather than in `config`.
 */
export type BuilderOutput = {
    readonly manifestId: string;
    readonly config: SparseConfig;
    readonly themeConfig: Record<string, unknown>;
    readonly plugins: readonly BuilderPlugin[];
};

const isSet = (value: object) => Object.keys(value).length > 0;

/** JSON as a reader reads it, which is how it goes into a content system. */
export function objectText(value: object): string {
    return JSON.stringify(value, null, 4);
}

/**
 * The same object as a JavaScript literal: unquoted keys where the key is an
 * identifier, and single quotes, because the three framework snippets are code
 * a reader pastes into a file their own formatter and linter will read. JSON's
 * quoted keys would parse and then be reformatted on the first save.
 */
function literal(value: unknown, depth: number): string {
    const pad = ' '.repeat(depth);
    if (typeof value === 'string') {
        return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
    if (value === null || typeof value !== 'object') return String(value);

    const entries = Object.entries(value as Record<string, unknown>).map(
        ([key, nested]) => {
            const name = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`;
            return `${pad}    ${name}: ${literal(nested, depth + 4)},`;
        },
    );
    return `{\n${entries.join('\n')}\n${pad}}`;
}

/**
 * Markup text — a manifest URL a reader pasted, so nothing about it is known.
 * `&` first, or the escapes introduced after it are escaped in turn.
 */
function attr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * JSON in a single-quoted attribute, which is the only quoting that can hold it.
 * The double quotes are left alone: escaping them would be correct and would
 * make the one attribute a reader most wants to read unreadable.
 */
function jsonAttr(value: object): string {
    return JSON.stringify(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/'/g, '&#39;');
}

/** Lines with nothing to say drop out, so an unset half leaves no blank line. */
const lines = (...parts: (string | null)[]) =>
    parts.filter((part): part is string => part !== null).join('\n');

/**
 * A plugin's IIFE, one script each, after core's own.
 *
 * The order is load-bearing for one of them: `@triiiceratops/plugin-av` reads
 * core's Svelte runtime off `window.Triiiceratops` rather than shipping a
 * second copy, so core's script has to have run first. Core's is always the
 * first line of this snippet, which is what makes the order right by
 * construction rather than by the reader remembering it.
 */
const pluginScripts = (plugins: readonly BuilderPlugin[]) =>
    plugins.map(
        (plugin) =>
            `<script src="https://unpkg.com/${plugin.pkg}/dist/iife.js"></script>`,
    );

/**
 * The registration the no-build page needs, and only that page: a plugin is a
 * plain object, so it reaches the element as a property rather than through an
 * attribute, and the registry the IIFEs write into is order-independent.
 */
function register(plugins: readonly BuilderPlugin[]): string {
    const got = plugins.map(
        (plugin) =>
            `            window.Triiiceratops.plugins.get('${plugin.pkg}'),`,
    );
    return `<script>
    // Plugins are plain objects, so they are set as a property, never as an
    // attribute. Registering a package does not activate it; this does.
    customElements.whenDefined('triiiceratops-viewer').then(() => {
        document.getElementById('viewer').plugins = [
${got.join('\n')}
        ];
    });
</script>`;
}

/** The import each chosen plugin needs in a bundler project. */
const pluginImports = (plugins: readonly BuilderPlugin[], pad: string) =>
    plugins.map(
        (plugin) => `${pad}import { ${plugin.symbol} } from '${plugin.pkg}';`,
    );

/**
 * The list, hoisted out of the render. Activation is keyed to plugin identity
 * rather than to the list's, but the guides build it once all the same, and a
 * snippet that taught otherwise would be teaching a habit that costs nothing
 * here and something in a larger component.
 */
const pluginList = (plugins: readonly BuilderPlugin[], pad: string) =>
    plugins.length > 0
        ? `${pad}const plugins = [${plugins.map((plugin) => plugin.symbol).join(', ')}];`
        : null;

function html({
    manifestId,
    config,
    themeConfig,
    plugins,
}: BuilderOutput): string {
    const any = plugins.length > 0;
    return `${lines(
        `<script src="https://unpkg.com/${PACKAGE_NAME}/dist/${PACKAGE_NAME}-element.iife.js"></script>`,
        ...pluginScripts(plugins),
    )}

${lines(
    '<triiiceratops-viewer',
    // Named only when something has to find it, so the bare embed stays bare.
    any ? '    id="viewer"' : null,
    `    manifest-id="${attr(manifestId)}"`,
    isSet(config) ? `    config='${jsonAttr(config)}'` : null,
    isSet(themeConfig) ? `    theme-config='${jsonAttr(themeConfig)}'` : null,
    '    style="display: block; width: 100%; height: 100vh;"',
    '></triiiceratops-viewer>',
)}${any ? `\n\n${register(plugins)}` : ''}`;
}

function react({
    manifestId,
    config,
    themeConfig,
    plugins,
}: BuilderOutput): string {
    return `${lines(
        `import { TriiiceratopsViewer } from '${PACKAGE_NAME}/react';`,
        ...pluginImports(plugins, ''),
        plugins.length > 0 ? '' : null,
        pluginList(plugins, ''),
    )}

export function Reader() {
    return (
${lines(
    '        <TriiiceratopsViewer',
    `            manifestId="${attr(manifestId)}"`,
    isSet(config) ? `            config={${literal(config, 12)}}` : null,
    isSet(themeConfig)
        ? `            themeConfig={${literal(themeConfig, 12)}}`
        : null,
    plugins.length > 0 ? '            plugins={plugins}' : null,
    "            style={{ display: 'block', height: '600px' }}",
    '        />',
)}
    );
}`;
}

function vue({
    manifestId,
    config,
    themeConfig,
    plugins,
}: BuilderOutput): string {
    const declared = isSet(config) || isSet(themeConfig) || plugins.length > 0;
    return `<script setup lang="ts">
${lines(
    `import { TriiiceratopsViewer } from '${PACKAGE_NAME}/vue';`,
    ...pluginImports(plugins, ''),
    declared ? '' : null,
    isSet(config) ? `const config = ${literal(config, 0)};` : null,
    isSet(themeConfig)
        ? `const themeConfig = ${literal(themeConfig, 0)};`
        : null,
    pluginList(plugins, ''),
)}
</script>

<template>
${lines(
    '    <TriiiceratopsViewer',
    `        manifest-id="${attr(manifestId)}"`,
    isSet(config) ? '        :config="config"' : null,
    isSet(themeConfig) ? '        :theme-config="themeConfig"' : null,
    plugins.length > 0 ? '        :plugins="plugins"' : null,
    '        style="display: block; height: 600px"',
    '    />',
)}
</template>`;
}

function svelte({
    manifestId,
    config,
    themeConfig,
    plugins,
}: BuilderOutput): string {
    const declared = isSet(config) || isSet(themeConfig) || plugins.length > 0;
    return `<script lang="ts">
${lines(
    `    import { TriiiceratopsViewer } from '${PACKAGE_NAME}/svelte';`,
    `    // The design tokens and themes, imported once anywhere in your app.`,
    `    import '${PACKAGE_NAME}/style.css';`,
    ...pluginImports(plugins, '    '),
    declared ? '' : null,
    isSet(config) ? `    const config = ${literal(config, 4)};` : null,
    isSet(themeConfig)
        ? `    const themeConfig = ${literal(themeConfig, 4)};`
        : null,
    pluginList(plugins, '    '),
)}
</script>

<!-- The container sets the height; the viewer fills it. -->
<div style="height: 600px;">
${lines(
    '    <TriiiceratopsViewer',
    `        manifestId="${attr(manifestId)}"`,
    isSet(config) ? '        {config}' : null,
    isSet(themeConfig) ? '        {themeConfig}' : null,
    plugins.length > 0 ? '        {plugins}' : null,
    '    />',
)}
</div>`;
}

const WRITERS: Record<FrameworkId, (output: BuilderOutput) => string> = {
    html,
    react,
    vue,
    svelte,
};

export function snippet(id: FrameworkId, output: BuilderOutput): string {
    return WRITERS[id](output);
}
