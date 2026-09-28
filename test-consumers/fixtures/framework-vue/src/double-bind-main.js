// Double-bound-handle route: one template ref on two viewers must fail with `TriiiceratopsHandleConflictError`.

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
