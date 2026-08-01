// The server route's component, shared verbatim by `prerender.mjs` (Node,
// `vue/server-renderer`) and by the browser's hydration entry. A plain render
// function, so Node imports it with no build step; nothing here reads viewer
// state, which does not exist on a server.

import { defineComponent, h } from 'vue';
import { TriiiceratopsViewer } from 'triiiceratops/vue';

import * as F from './fixtures.js';

export const SSR_HOST_ID = 'ssr-viewer';

export const SsrApp = defineComponent({
    name: 'SsrApp',
    setup() {
        return () =>
            h('div', { id: 'ssr-root' }, [
                h(TriiiceratopsViewer, {
                    // Attribute tier — the only viewer input the server emits.
                    manifestId: F.MANIFEST_ID,
                    canvasId: F.CANVAS_2,
                    theme: 'dark',
                    // Property tier — must NOT reach the server's markup.
                    manifestJson: F.MANIFEST_JSON,
                    config: F.CONFIG,
                    searchProvider: F.searchProvider,
                    // Host attributes — forwarded on both sides identically.
                    id: SSR_HOST_ID,
                    class: 'ssr-viewer',
                    style: 'display:block;width:320px;height:240px',
                    'data-ssr': 'yes',
                    'aria-label': 'Server rendered fixture viewer',
                }),
            ]);
    },
});
