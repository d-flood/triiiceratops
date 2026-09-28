/** Builder handoffs as text, produced from the same state the preview runs. */

import type { SparseConfig } from '@triiiceratops/config';
import type { BuiltInTheme } from 'triiiceratops';

import { PACKAGE_NAME } from '../install';
import type { BuilderPlugin } from './plugins';

export type FrameworkId = 'html' | 'react' | 'vue' | 'svelte';

export type Framework = {
    readonly id: FrameworkId;
    readonly label: string;
    readonly doc: string;
    readonly href: string;
    readonly entry: string;
    readonly language: string;
};

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

export type BuilderOutput = {
    readonly manifestId: string;
    readonly theme: BuiltInTheme;
    readonly config: SparseConfig;
    readonly themeConfig: Record<string, unknown>;
    readonly plugins: readonly BuilderPlugin[];
};

const isSet = (value: object) => Object.keys(value).length > 0;

export function objectText(value: object): string {
    return JSON.stringify(value, null, 4);
}

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

/* `&` first, or later escapes are escaped in turn. */
function attr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function jsonAttr(value: object): string {
    return JSON.stringify(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/'/g, '&#39;');
}

const lines = (...parts: (string | null)[]) =>
    parts.filter((part): part is string => part !== null).join('\n');

/* Core first: AV reads the Svelte runtime off `window.Triiiceratops`. */
const pluginScripts = (plugins: readonly BuilderPlugin[]) =>
    plugins.map(
        (plugin) =>
            `<script src="https://unpkg.com/${plugin.pkg}/dist/iife.js"></script>`,
    );

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

const pluginImports = (plugins: readonly BuilderPlugin[], pad: string) =>
    plugins.map(
        (plugin) => `${pad}import { ${plugin.symbol} } from '${plugin.pkg}';`,
    );

const pluginList = (plugins: readonly BuilderPlugin[], pad: string) =>
    plugins.length > 0
        ? `${pad}const plugins = [${plugins.map((plugin) => plugin.symbol).join(', ')}];`
        : null;

function html({
    manifestId,
    theme,
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
    any ? '    id="viewer"' : null,
    `    manifest-id="${attr(manifestId)}"`,
    `    theme="${theme}"`,
    isSet(config) ? `    config='${jsonAttr(config)}'` : null,
    isSet(themeConfig) ? `    theme-config='${jsonAttr(themeConfig)}'` : null,
    '    style="display: block; width: 100%; height: 100vh;"',
    '></triiiceratops-viewer>',
)}${any ? `\n\n${register(plugins)}` : ''}`;
}

function react({
    manifestId,
    theme,
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
    `            theme="${theme}"`,
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
    theme,
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
    `        theme="${theme}"`,
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
    theme,
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
    `        theme="${theme}"`,
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
