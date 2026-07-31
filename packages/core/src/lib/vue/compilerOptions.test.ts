/**
 * The claim that a Vue consumer needs NO `compilerOptions.isCustomElement`.
 *
 * `<TriiiceratopsViewer>` is a render-function component, so the raw
 * `triiiceratops-viewer` tag is created with `h()` and never reaches Vue's
 * template compiler. A consumer's template only ever names the component, which
 * Vue resolves like any other.
 *
 * The contrast case is what gives this test teeth, and it has to run BEFORE the
 * element is registered — which is also the honest consumer situation, because
 * wrapper registration is lazy and asynchronous, so a template is compiled long
 * before `customElements.get()` would answer. (Vue's runtime compiler installs
 * a default `isCustomElement` of `tag => !!customElements.get(tag)`, so an
 * ALREADY-registered tag happens not to warn. A consumer cannot rely on that
 * ordering; the wrapper removes the question entirely.) The first test asserts
 * the tag is unregistered at that moment, so this file cannot silently pass if
 * its order ever changes.
 */

import { createApp, defineComponent } from 'vue';
import type { App } from 'vue';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import type { ViewerStateSnapshot } from '../state/viewer.svelte.js';
import { TriiiceratopsViewer } from './viewer.js';

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const {
    defineRealViewerElement,
    installInertAnimations,
    isRealViewerElementDefined,
    settle,
    VIEWER_TAG,
} = await import('../test/utils/realViewerElement.js');

let container: HTMLDivElement;
let app: App | null = null;

beforeAll(() => {
    installInertAnimations();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(async () => {
    app?.unmount();
    app = null;
    container.remove();
    await settle(0);
});

describe('a consumer template compiled with no custom-element configuration', () => {
    it('warns when the template writes the raw tag itself', () => {
        // Runs first, on purpose: the element is not registered yet, exactly as
        // in a real application at template-compile time.
        expect(isRealViewerElementDefined()).toBe(false);
        const warnings: string[] = [];

        app = createApp(
            defineComponent({ template: `<triiiceratops-viewer />` }),
        );
        app.config.warnHandler = (message) => warnings.push(message);
        app.mount(container);

        expect(
            warnings.filter((message) =>
                message.includes('compilerOptions.isCustomElement'),
            ).length,
        ).toBeGreaterThan(0);
    });

    it('renders the wrapper with no warning and maps kebab props and emits', async () => {
        defineRealViewerElement();
        const warnings: string[] = [];
        const canvasChanges: ViewerStateSnapshot[] = [];

        app = createApp(
            defineComponent({
                components: { TriiiceratopsViewer },
                setup: () => ({
                    onCanvasChange: (snapshot: ViewerStateSnapshot) =>
                        canvasChanges.push(snapshot),
                }),
                template: `
                    <TriiiceratopsViewer
                        manifest-id="https://example.org/manifest"
                        theme="dark"
                        @canvas-change="onCanvasChange"
                    />
                `,
            }),
        );
        app.config.warnHandler = (message) => warnings.push(message);
        // Deliberately never set: this is the configuration the wrapper spares
        // its consumers.
        expect(app.config.compilerOptions.isCustomElement).toBeUndefined();

        app.mount(container);
        await settle();

        expect(warnings).toEqual([]);
        const element = container.querySelector(VIEWER_TAG);
        expect(element).not.toBeNull();
        // The kebab-cased template attributes reached the camelCase props,
        // which reached the element's attribute tier.
        expect(element?.getAttribute('manifest-id')).toBe(
            'https://example.org/manifest',
        );
        expect(element?.getAttribute('theme')).toBe('dark');

        // And the kebab-cased template listener reached the emit.
        const state = (
            element as { viewerState?: { setCanvas(id: string): void } }
        ).viewerState;
        state?.setCanvas('https://example.org/canvas/3');
        await settle();
        expect(canvasChanges.at(-1)?.canvasId).toBe(
            'https://example.org/canvas/3',
        );
    });
});
