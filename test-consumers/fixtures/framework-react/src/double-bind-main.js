// The double-bound-handle route (SPEC user story 36).
//
// One handle, two viewers. A handle identifies exactly ONE viewer, so the
// second one to mount must fail loudly and framework-natively rather than
// silently taking the box over — otherwise every read through that handle
// follows whichever viewer happened to mount last, and a page with two viewers
// is quietly wrong.
//
// React's handle is the `useViewerHandle()` slot, passed with the `handle`
// prop; Vue's is an ordinary template ref. The two fixtures differ only in that
// wiring: both must produce the SAME `TriiiceratopsHandleConflictError`, naming
// both elements, promptly, on the real packed artifact.

import { Component, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { TriiiceratopsViewer, useViewerHandle } from 'triiiceratops/react';

import * as F from './fixtures.js';

const started = performance.now();

window.__doubleBind = {
    framework: 'react',
    captured: [],
    elapsedMs: null,
};

function capture(error) {
    window.__doubleBind.captured.push({
        name: (error && error.name) || null,
        code: (error && error.code) || null,
        message: String((error && error.message) || error),
    });
    if (window.__doubleBind.elapsedMs === null) {
        window.__doubleBind.elapsedMs = performance.now() - started;
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

    // Deliberately no `componentDidCatch`: the root's `onCaughtError` records
    // the failure, so ONE thrown error produces exactly one captured record and
    // the assertion can be an equality rather than a floor.
    render() {
        return h(
            'div',
            null,
            h(
                'span',
                { 'data-testid': 'double-bind-status' },
                this.state.failed ? 'failed' : 'pending',
            ),
            this.state.failed ? null : this.props.children,
        );
    }
}

/** One slot from `useViewerHandle()`, handed to BOTH viewers. */
function DoubleBound() {
    const handle = useViewerHandle();
    return h(
        'div',
        null,
        h(TriiiceratopsViewer, {
            handle,
            id: 'double-bind-a',
            manifestJson: F.MANIFEST_JSON,
            style: { display: 'block', width: '160px', height: '120px' },
        }),
        h(TriiiceratopsViewer, {
            handle,
            id: 'double-bind-b',
            manifestJson: F.MANIFEST_JSON,
            style: { display: 'block', width: '160px', height: '120px' },
        }),
    );
}

createRoot(document.getElementById('app'), {
    onCaughtError: capture,
    onUncaughtError: capture,
}).render(h(Boundary, null, h(DoubleBound)));
