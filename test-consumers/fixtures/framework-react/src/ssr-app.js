// The server route's component, shared verbatim by `prerender.mjs` (Node,
// `react-dom/server`) and by the browser's hydration entry. Nothing here reads
// viewer state: state-reading components deliberately have no server snapshot.

import { createElement as h } from 'react';
import { TriiiceratopsViewer } from 'triiiceratops/react';

import * as F from './fixtures.js';

export const SSR_HOST_ID = 'ssr-viewer';

export function SsrApp() {
    return h(
        'div',
        { id: 'ssr-root' },
        h(TriiiceratopsViewer, {
            // Attribute tier — the only viewer input the server may emit.
            manifestId: F.MANIFEST_ID,
            canvasId: F.CANVAS_2,
            theme: 'dark',
            // Property tier — must NOT reach the server's markup.
            manifestJson: F.MANIFEST_JSON,
            config: F.CONFIG,
            searchProvider: F.searchProvider,
            // Host attributes — forwarded on both sides, so hydration matches.
            id: SSR_HOST_ID,
            className: 'ssr-viewer',
            style: { display: 'block', width: '320px', height: '240px' },
            'data-ssr': 'yes',
            'aria-label': 'Server rendered fixture viewer',
        }),
    );
}
