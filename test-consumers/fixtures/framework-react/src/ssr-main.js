import { createElement as h } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { SsrApp, SSR_HOST_ID } from './ssr-app.js';

const diagnostics = [];
for (const level of ['warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
        diagnostics.push(args.map((a) => String(a)).join(' '));
        original(...args);
    };
}

const mount = document.getElementById('ssr-mount');
// Captured BEFORE hydration: the exact node the server sent, so "hydration
// reuses and upgrades the same host" is an identity check, not a guess.
const serverHost = mount.querySelector('#' + SSR_HOST_ID);

window.__ssr = {
    serverHtml: mount.innerHTML,
    serverHostFound: !!serverHost,
    diagnostics,
    recoverable: [],
    ready: () => {
        const el = document.getElementById(SSR_HOST_ID);
        return !!(el && el.viewerState);
    },
    operate: () => {
        const el = document.getElementById(SSR_HOST_ID);
        const state = el && el.viewerState;
        if (!state) return null;
        state.setCanvas('primary/c3');
        return state.canvasId;
    },
    hostReused: () => document.getElementById(SSR_HOST_ID) === serverHost,
    hostUpgraded: () => {
        const ctor = window.customElements.get('triiiceratops-viewer');
        return !!ctor && serverHost instanceof ctor;
    },
};

hydrateRoot(mount, h(SsrApp), {
    onRecoverableError: (error) => {
        window.__ssr.recoverable.push(
            String((error && error.message) || error),
        );
    },
});
