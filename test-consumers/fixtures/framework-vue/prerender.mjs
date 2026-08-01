// Render the server route with `vue/server-renderer` in plain Node and inject
// the markup into the built `dist/ssr.html`, exactly as a server-rendering host
// would. The static file server the harness runs then serves genuine
// server-rendered HTML for the browser to hydrate.
//
// This step is also the fixture's SSR-safety gate: it runs with no `window`,
// no `document`, and no `customElements`, and asserts that importing
// `triiiceratops/vue` neither reaches for them nor registers anything.

import { readFileSync, writeFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { SsrApp } from './src/ssr-app.js';

for (const name of ['window', 'document', 'customElements']) {
    if (typeof globalThis[name] !== 'undefined') {
        throw new Error(`prerender ran with a browser \`${name}\` global`);
    }
}

const markup = await renderToString(createSSRApp(SsrApp));

if (typeof globalThis.customElements !== 'undefined') {
    throw new Error('the server render created a custom-element registry');
}
if (globalThis.Triiiceratops !== undefined) {
    throw new Error('the server render bootstrapped the browser runtime');
}
if (!markup.includes('<triiiceratops-viewer')) {
    throw new Error('the server render emitted no viewer host');
}

const file = new URL('./dist/ssr.html', import.meta.url);
const html = readFileSync(file, 'utf8');
if (!html.includes('<!--ssr-outlet-->')) {
    throw new Error('dist/ssr.html lost its <!--ssr-outlet--> placeholder');
}
writeFileSync(file, html.replace('<!--ssr-outlet-->', markup));
