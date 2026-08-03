// The version-conflict route.
//
// A FOREIGN `<triiiceratops-viewer>` — no `viewerState` getter, so no state
// bridge — is registered before the wrapper mounts. Custom-element registration
// is first-wins and cannot be replaced, so the wrapper must diagnose this
// promptly and framework-natively rather than waiting forever for an
// availability event that will never arrive.

import { Component, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { TriiiceratopsViewer } from 'triiiceratops/react';

class ForeignViewer extends HTMLElement {}
customElements.define('triiiceratops-viewer', ForeignViewer);

const started = performance.now();

window.__conflict = {
    captured: [],
    elapsedMs: null,
    // Importing `triiiceratops/react` above registered nothing, so the foreign
    // constructor still owns the tag.
    foreignOwnsTag:
        window.customElements.get('triiiceratops-viewer') === ForeignViewer,
};

function capture(error) {
    window.__conflict.captured.push({
        name: (error && error.name) || null,
        code: (error && error.code) || null,
        message: String((error && error.message) || error),
    });
    if (window.__conflict.elapsedMs === null) {
        window.__conflict.elapsedMs = performance.now() - started;
    }
}

class Boundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        capture(error);
    }

    render() {
        return h(
            'div',
            null,
            h(
                'span',
                { 'data-testid': 'conflict-status' },
                this.state.failed ? 'failed' : 'pending',
            ),
            this.state.failed ? null : this.props.children,
        );
    }
}

createRoot(document.getElementById('app'), {
    onCaughtError: capture,
    onUncaughtError: capture,
}).render(
    h(
        Boundary,
        null,
        h(TriiiceratopsViewer, { manifestId: 'local://conflict' }),
    ),
);
