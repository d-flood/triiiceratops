/**
 * The epic's headline promise, compiled rather than asserted: a Vue consumer
 * type-checks against `triiiceratops/vue` with **no Svelte installed** and
 * **`skipLibCheck: false`**, so any Svelte type reaching the published
 * declaration graph of this subpath fails the packed run.
 *
 * `skipLibCheck: false` is what gives that teeth — every `.d.ts` this program
 * pulls in is checked, so an unresolvable Svelte type import anywhere in
 * `dist/vue.d.ts`'s closure is an error here even though nothing in this file
 * mentions Svelte. `types: []` keeps ambient `@types/*` packages out, so the
 * only declarations in play are the ones the tarball and `vue` actually ship.
 *
 * It is deliberately NOT a bare `import 'triiiceratops/vue'`: a leak in a type
 * nobody references can hide behind laziness in the checker. Every named export
 * is used for what it is — the component is rendered with props from every
 * tier and every emit handler, the composables are called and their results
 * consumed, each error class is constructed or narrowed to, and every exported
 * type annotates a value.
 *
 * Authored as a `.ts` render function rather than an SFC on purpose: checking
 * a `.vue` file needs `vue-tsc`, and `tsc` is the tool whose `skipLibCheck`
 * behaviour this fixture is pinning. The fixture's real SFCs are covered by the
 * browser journey.
 *
 * `.` is deliberately exempt and must never be imported here: it is the Svelte
 * consumer's entry and exports the compiled component, whose declaration
 * legitimately imports `svelte`.
 */

import { defineComponent, h, shallowRef } from 'vue';
import type { ComputedRef, ShallowRef, VNode } from 'vue';

import {
    provideViewer,
    TriiiceratopsCoreConflictError,
    TriiiceratopsElementRegistrationError,
    TriiiceratopsElementVersionError,
    TriiiceratopsHandleConflictError,
    TriiiceratopsViewer,
    useViewer,
    useViewerSelector,
    VIEWER_ELEMENT_TAG,
    VIEWER_EVENT_CHANNELS,
    VIEWER_STATE_AVAILABLE_EVENT,
    ViewerProvider,
    type CanvasRegion,
    type IconDescriptor,
    type PluginError,
    type PluginMountThunk,
    type PluginSurface,
    type PluginUiTarget,
    type ReadonlyViewerState,
    type SdkPlugin,
    type SearchHit,
    type SearchProvider,
    type SearchProviderContext,
    type SearchResultGroup,
    type SelectorCadence,
    type ThemeConfig,
    type TriiiceratopsViewerElement,
    type TriiiceratopsViewerInstance,
    type TriiiceratopsViewerProps,
    type ViewerConfig,
    type ViewerEmits,
    type ViewerError,
    type ViewerEventChannel,
    type ViewerEventDetail,
    type ViewerEventDetailMap,
    type ViewerHandle,
    type ViewerHandleRef,
    type ViewerHandleSlot,
    type ViewerProjection,
    type ViewerProviderProps,
    type ViewerSelectorOptions,
    type ViewerStateSnapshot,
} from 'triiiceratops/vue';

// ---------------------------------------------------------------------------
// Values: the two constants and the four error classes.
// ---------------------------------------------------------------------------

export const tag: 'triiiceratops-viewer' = VIEWER_ELEMENT_TAG;
export const availableEvent: string = VIEWER_STATE_AVAILABLE_EVENT;
export const channels: readonly ViewerEventChannel[] = VIEWER_EVENT_CHANNELS;

/** Every error the subpath exports, narrowed the way a consumer narrows it. */
export function describeFailure(error: unknown): string {
    if (error instanceof TriiiceratopsHandleConflictError) {
        const code: 'VIEWER_HANDLE_CONFLICT' = error.code;
        return `${code}: ${error.message}`;
    }
    if (error instanceof TriiiceratopsElementVersionError) {
        const code: 'ELEMENT_VERSION_CONFLICT' = error.code;
        return `${code} on <${error.tag}>`;
    }
    if (error instanceof TriiiceratopsElementRegistrationError) {
        return error.code;
    }
    if (error instanceof TriiiceratopsCoreConflictError) {
        return error.message;
    }
    return 'unknown';
}

// ---------------------------------------------------------------------------
// Types: every exported type annotates a real value.
// ---------------------------------------------------------------------------

const themeConfig: ThemeConfig = { cssVars: { '--tri-token': '#123456' } };
const config: ViewerConfig = { debug: false, toolbarOpen: true };
const region: CanvasRegion = { x: 0, y: 0, width: 100, height: 100 };

const icon: IconDescriptor = {
    kind: 'svg',
    inner: '<circle />',
    viewBox: '0 0 1 1',
};
const target: PluginUiTarget = 'flyout';
const mount: PluginMountThunk = (container: HTMLElement) => {
    container.textContent = 'typecheck';
    return () => {};
};

/**
 * The plugin types, used the way a consumer uses them: describing plugins it
 * received, never fabricating one. `SdkPlugin` is built by
 * `@triiiceratops/plugin-sdk`'s `definePlugin`, which this fixture deliberately
 * does not install.
 */
export function describePlugins(plugins: readonly SdkPlugin[]): string[] {
    return plugins.map(
        (plugin) =>
            `${plugin.name}@${plugin.version} → ${plugin.target} ` +
            `(${plugin.icon.kind} ${plugin.icon.viewBox})`,
    );
}

export function renderInto(surface: PluginSurface, host: HTMLElement): void {
    if (surface.isOpen && surface.target === target) {
        const cleanup = mount(host);
        cleanup();
    }
    void icon;
}

const searchProvider: SearchProvider = async (
    query: string,
    context: SearchProviderContext,
): Promise<SearchResultGroup[]> => {
    const hit: SearchHit = { type: 'hit', match: query };
    const group: SearchResultGroup = {
        canvasIndex: 0,
        canvasLabel: context.canvasId ?? 'canvas 1',
        hits: [hit],
    };
    return [group];
};

const cadence: SelectorCadence = 'frame';
const selectorOptions: ViewerSelectorOptions<number> = {
    cadence,
    equals: (a: number, b: number) => a === b,
};
const projection: ViewerProjection<string | null> = (
    state: ReadonlyViewerState,
) => state.canvasId;

/** The event detail map, and one detail read out of it by channel. */
export function detailOf(
    map: ViewerEventDetailMap,
): ViewerEventDetail<'statechange'> {
    const snapshot: ViewerStateSnapshot = map.statechange;
    const pluginError: ViewerEventDetail<'pluginerror'> = map.pluginerror;
    const viewerError: ViewerEventDetail<'viewererror'> = map.viewererror;
    void pluginError.pluginName;
    void viewerError.code;
    return snapshot;
}

/** The emits, as their own type: each payload is the element's DETAIL. */
export function emitPayloads(emits: ViewerEmits): string {
    const [snapshot]: ViewerEmits['stateChange'] = emits.stateChange;
    const [pluginError]: ViewerEmits['pluginError'] = emits.pluginError;
    const [viewerError]: ViewerEmits['viewerError'] = emits.viewerError;
    void pluginError.pluginName;
    void `${viewerError.scope}/${viewerError.code}`;
    return snapshot.canvasId ?? 'none';
}

/** The full prop object, typed as the component's own props type. */
const viewerProps: TriiiceratopsViewerProps = {
    manifestId: 'https://example.org/manifest',
    canvasId: 'https://example.org/canvas/1',
    theme: 'light',
    manifestJson: { id: 'local://m', type: 'Manifest' },
    themeConfig,
    config,
    initialCanvasRegion: region,
    plugins: [],
    searchProvider,
};

// ---------------------------------------------------------------------------
// The component and the composables, as a render function.
// ---------------------------------------------------------------------------

const Readouts = defineComponent({
    name: 'TypecheckReadouts',
    props: {
        viewer: {
            type: Object as () => ViewerHandleRef,
            required: true,
        },
    },
    setup(props) {
        // Explicit-handle form.
        const state: ComputedRef<ReadonlyViewerState | undefined> = useViewer(
            props.viewer,
        );
        const canvasId: ComputedRef<string | null | undefined> =
            useViewerSelector(props.viewer, projection);
        const zoom: ComputedRef<number | undefined> = useViewerSelector(
            props.viewer,
            (viewer: ReadonlyViewerState) =>
                viewer.osdViewer?.viewport.getZoom() ?? 1,
            selectorOptions,
        );
        // Context form: no handle argument at all.
        const contextCanvas: ComputedRef<string | null | undefined> =
            useViewerSelector((viewer: ReadonlyViewerState) => viewer.canvasId);
        const contextState: ComputedRef<ReadonlyViewerState | undefined> =
            useViewer();

        return (): VNode =>
            h('ul', null, [
                h('li', null, state.value?.manifestId ?? 'none'),
                h('li', null, canvasId.value ?? 'none'),
                h('li', null, String(zoom.value ?? 0)),
                h('li', null, contextCanvas.value ?? 'none'),
                h('li', null, contextState.value?.canvasId ?? 'none'),
            ]);
    },
});

export const App = defineComponent({
    name: 'TypecheckApp',
    setup() {
        // The documented shape: a `shallowRef`, never a deep `ref`.
        const viewer: ShallowRef<TriiiceratopsViewerInstance | null> =
            shallowRef(null);
        provideViewer(viewer);

        const readHandle = (): string => {
            const element: TriiiceratopsViewerElement | undefined =
                viewer.value?.element;
            const state: ReadonlyViewerState | undefined = viewer.value?.state;
            void element?.viewerState;
            return state?.canvasId ?? 'none';
        };

        const providerProps: ViewerProviderProps = { value: viewer };

        return (): VNode =>
            h(ViewerProvider, providerProps, () => [
                h(TriiiceratopsViewer, {
                    ...viewerProps,
                    ref: viewer,
                    id: 'typecheck-viewer',
                    class: 'typecheck',
                    style: { display: 'block', height: '400px' },
                    'data-role': 'primary',
                    'aria-label': 'Typecheck viewer',
                    onStateChange: (snapshot: ViewerStateSnapshot) =>
                        void snapshot.canvasId,
                    onCanvasChange: (snapshot: ViewerStateSnapshot) =>
                        void snapshot.canvasId,
                    onManifestChange: (snapshot: ViewerStateSnapshot) =>
                        void snapshot.manifestId,
                    onChoiceChange: (snapshot: ViewerStateSnapshot) =>
                        void snapshot.canvasId,
                    onPluginError: (error: PluginError) => error.retry(),
                    onViewerError: (error: ViewerError) =>
                        void `${error.scope}/${error.code}`,
                }),
                h(Readouts, { viewer }),
                h('span', null, readHandle()),
            ]);
    },
});

/**
 * The two framework-neutral handle types are exported here too, for a consumer
 * whose own helpers speak them (a `triiiceratops/testing` handle wrapped in a
 * `shallowRef`, say).
 */
export function widen(handle: ViewerHandle): ViewerHandleRef {
    const slot: ViewerHandleSlot | null = null;
    void slot;
    return shallowRef<TriiiceratopsViewerInstance>({
        element: handle.element,
        state: handle.state,
    });
}
