// The version-conflict route.
//
// A FOREIGN `<triiiceratops-viewer>` — no `viewerState` getter, so no state
// bridge — is registered before the wrapper mounts. Custom-element registration
// is first-wins and cannot be replaced, so the wrapper must diagnose this
// promptly and framework-natively rather than waiting forever for an
// availability event that will never arrive.

import { createApp, defineComponent, h, onErrorCaptured, ref } from 'vue';
import { TriiiceratopsViewer } from 'triiiceratops/vue';

class ForeignViewer extends HTMLElement {}
customElements.define('triiiceratops-viewer', ForeignViewer);

const started = performance.now();

window.__conflict = {
    captured: [],
    elapsedMs: null,
    // Importing `triiiceratops/vue` above registered nothing, so the foreign
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

const Root = defineComponent({
    name: 'ConflictRoot',
    setup() {
        const failed = ref(false);
        onErrorCaptured((error) => {
            failed.value = true;
            capture(error);
        });
        return () =>
            h('div', null, [
                h(
                    'span',
                    { 'data-testid': 'conflict-status' },
                    failed.value ? 'failed' : 'pending',
                ),
                failed.value
                    ? null
                    : h(TriiiceratopsViewer, {
                          manifestId: 'local://conflict',
                      }),
            ]);
    },
});

const app = createApp(Root);
app.config.errorHandler = capture;
app.mount('#app');
