/** No-Svelte consumer: `skipLibCheck: false` makes any Svelte type leak fail. */

import { useRef, useState, type ReactElement } from 'react';

import {
    TriiiceratopsCoreConflictError,
    TriiiceratopsElementRegistrationError,
    TriiiceratopsElementVersionError,
    TriiiceratopsHandleConflictError,
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
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
    type TriiiceratopsViewerProps,
    type TriiiceratopsViewerRef,
    type ViewerConfig,
    type ViewerError,
    type ViewerEventChannel,
    type ViewerEventDetail,
    type ViewerEventDetailMap,
    type ViewerEventProps,
    type ViewerHandle,
    type ViewerHandleSlot,
    type ViewerProjection,
    type ViewerProviderProps,
    type ViewerSelectorOptions,
    type ViewerStateSnapshot,
} from 'triiiceratops/react';

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

/** Callback props, as their own type, spread onto the component below. */
const eventProps: ViewerEventProps = {
    onStateChange: (snapshot: ViewerStateSnapshot) => void snapshot.canvasId,
    onCanvasChange: (snapshot: ViewerStateSnapshot) => void snapshot.canvasId,
    onManifestChange: (snapshot: ViewerStateSnapshot) =>
        void snapshot.manifestId,
    onChoiceChange: (snapshot: ViewerStateSnapshot) => void snapshot.canvasId,
    onPluginError: (error: PluginError) => error.retry(),
    onViewerError: (error: ViewerError) => void `${error.scope}/${error.code}`,
};

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
    ...eventProps,
};

// ---------------------------------------------------------------------------
// The component and the hooks, as JSX.
// ---------------------------------------------------------------------------

function Readouts({ handle }: { handle: ViewerHandleSlot }): ReactElement {
    // Explicit-handle form.
    const state: ReadonlyViewerState | undefined = useViewer(handle);
    const canvasId: string | null | undefined = useViewerSelector(
        handle,
        projection,
    );
    const zoom: number | undefined = useViewerSelector(
        handle,
        (viewer: ReadonlyViewerState) => viewer.viewportScale,
        selectorOptions,
    );
    // Context form: no handle argument at all.
    const contextCanvas: string | null | undefined = useViewerSelector(
        (viewer: ReadonlyViewerState) => viewer.canvasId,
    );
    const contextState: ReadonlyViewerState | undefined = useViewer();

    return (
        <ul>
            <li>{state?.manifestId ?? 'none'}</li>
            <li>{canvasId ?? 'none'}</li>
            <li>{zoom ?? 0}</li>
            <li>{contextCanvas ?? 'none'}</li>
            <li>{contextState?.canvasId ?? 'none'}</li>
        </ul>
    );
}

export function App(): ReactElement {
    const handle: ViewerHandleSlot = useViewerHandle();
    const viewerRef = useRef<TriiiceratopsViewerRef | null>(null);
    const [element, setElement] = useState<TriiiceratopsViewerElement | null>(
        null,
    );

    // The two-member imperative handle, read the way a consumer reads it.
    const current: ViewerHandle | null = handle.get();
    void current?.state.canvasId;
    void current?.element.viewerState;
    void element?.viewerState;

    const providerProps: ViewerProviderProps = { value: handle };

    return (
        <ViewerProvider {...providerProps}>
            <TriiiceratopsViewer
                {...viewerProps}
                handle={handle}
                ref={viewerRef}
                id="typecheck-viewer"
                className="typecheck"
                style={{ display: 'block', height: '400px' }}
                data-role="primary"
                aria-label="Typecheck viewer"
                onClick={(event) =>
                    setElement(
                        event.currentTarget as TriiiceratopsViewerElement,
                    )
                }
            />
            <Readouts handle={handle} />
        </ViewerProvider>
    );
}
