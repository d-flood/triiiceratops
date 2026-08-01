// The double-bound-handle route (SPEC user story 36).
//
// One handle, two viewers. A handle identifies exactly ONE viewer, so the
// second one to mount must fail loudly and framework-natively rather than
// silently taking the box over — otherwise every read through that handle
// follows whichever viewer happened to mount last, and a page with two viewers
// is quietly wrong.
//
// Vue's handle is an ORDINARY template ref, not a wrapper-owned prop, so the
// wrapper never sees it as a prop: it takes ownership of the box the ref writes
// into (`vue/templateRefOwnership.ts`) using the same substrate slot React's
// `handle` prop claims. The two fixtures differ only in that wiring; both must
// produce the SAME `TriiiceratopsHandleConflictError`, naming both elements,
// promptly, on the real packed artifact.

import { createApp, defineComponent, h, ref, shallowRef } from 'vue';
import { TriiiceratopsViewer } from 'triiiceratops/vue';

import * as F from './fixtures.js';

const started = performance.now();

window.__doubleBind = {
    framework: 'vue',
    captured: [],
    elapsedMs: null,
};

const failed = ref(false);

function capture(error) {
    failed.value = true;
    window.__doubleBind.captured.push({
        name: (error && error.name) || null,
        code: (error && error.code) || null,
        message: String((error && error.message) || error),
    });
    if (window.__doubleBind.elapsedMs === null) {
        window.__doubleBind.elapsedMs = performance.now() - started;
    }
}

const Root = defineComponent({
    name: 'DoubleBindRoot',
    setup() {
        // ONE template ref, put on BOTH viewers. `shallowRef` is what the guide
        // tells Vue consumers to use for a handle they manage themselves.
        const viewer = shallowRef(null);
        const style = { display: 'block', width: '160px', height: '120px' };
        return () =>
            h('div', null, [
                h(
                    'span',
                    { 'data-testid': 'double-bind-status' },
                    failed.value ? 'failed' : 'pending',
                ),
                h(TriiiceratopsViewer, {
                    ref: viewer,
                    id: 'double-bind-a',
                    manifestJson: F.MANIFEST_JSON,
                    style,
                }),
                h(TriiiceratopsViewer, {
                    ref: viewer,
                    id: 'double-bind-b',
                    manifestJson: F.MANIFEST_JSON,
                    style,
                }),
            ]);
    },
});

const app = createApp(Root);
// The only capture point, so one thrown error produces exactly one record.
app.config.errorHandler = capture;
app.mount('#app');
