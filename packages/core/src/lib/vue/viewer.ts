/**
 * `<TriiiceratopsViewer>` — the Vue 3.5 framework wrapper.
 *
 * It hosts the existing `<triiiceratops-viewer>` custom element and translates
 * its lifecycle, properties, events, and viewer state into Vue idioms. It does
 * not implement or own a second viewer, and it renders exactly ONE element: no
 * layout wrapper, no slot content, nothing projected into light or shadow DOM.
 * Adopting the wrapper therefore changes no sizing or CSS.
 *
 * Authored as a plain `.ts` render function with `h()` and `defineComponent` —
 * no single-file component, no `.vue` file, and no extra build step.
 * `build:lib`'s `svelte-package` step copies unknown file types verbatim, so a
 * `.vue` here would ship broken. Because the component is a render function,
 * the raw custom-element tag never reaches Vue's template compiler and a
 * consumer needs no `compilerOptions.isCustomElement` configuration.
 *
 * ## The three prop tiers
 *
 * - **Attribute tier** (`manifestId`, `canvasId`, `theme`) is rendered
 *   declaratively as kebab-case attributes, identically on the server and on
 *   the client's first render, so hydration reuses and upgrades the same host.
 *   Each key is `^`-prefixed, which is Vue's own "force this to be an
 *   attribute" marker: without it `shouldSetAsProp`'s `key in el` test would
 *   route `theme` through `el.theme = …` once the element happened to be
 *   upgraded, and through `setAttribute` when it happened not to be.
 * - **Property tier** (`manifestJson`, `themeConfig`, `config`,
 *   `initialCanvasRegion`, `plugins`, `searchProvider`) goes through the shared
 *   applier, NEVER through vnode props. Vue's `shouldSetAsProp` falls back to
 *   `setAttribute(key, String(value))` on an element that is not yet defined,
 *   which would stringify a manifest object or a search function into an
 *   attribute.
 * - **Host attributes** (`class`, `style`, `id`, `data-*`, `aria-*`, ordinary
 *   DOM attributes and listeners) are forwarded deliberately. `inheritAttrs` is
 *   disabled and `attrs` is spread onto the element by the render function, so
 *   attribute inheritance stays predictable even though the component renders a
 *   single element.
 *
 * ## The template ref belongs to one viewer
 *
 * The handle is an ordinary template ref rather than a wrapper-owned prop, so
 * nothing about the component's signature says a ref may not be reused. The
 * mount hook therefore claims the BOX the ref writes into, through the same
 * substrate slot React's `handle` prop claims: one ref put on two viewers
 * raises `TriiiceratopsHandleConflictError` naming both elements instead of
 * silently making every read follow whichever mounted last. See
 * `templateRefOwnership.ts` for which ref shapes own a box and which (a
 * callback ref, a ref inside `v-for`) deliberately do not.
 *
 * `manifestId` and `canvasId` are one-way, UNCONTROLLED inputs: they are an
 * instruction to the viewer, not a continuously enforced binding, so
 * re-asserting an unchanged value after the user navigates internally writes
 * nothing and the wrapper never fights the viewer. No `v-model` is offered.
 * Observe where the viewer actually is with `useViewerSelector` or the
 * `canvas-change` / `manifest-change` emits.
 */

import {
    defineComponent,
    getCurrentInstance,
    h,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    onMounted,
    shallowRef,
    watch,
    watchEffect,
} from 'vue';
import type { PropType, VNode } from 'vue';

import {
    createViewerBinding,
    createViewerPropApplier,
    VIEWER_ELEMENT_TAG,
    VIEWER_EVENT_CHANNELS,
    viewerElementAttributes,
    type TriiiceratopsViewerElement,
    type ViewerAttributeProps,
    type ViewerBindingController,
    type ViewerElementProps,
    type ViewerEventChannel,
    type ViewerHandle,
    type ViewerPropApplier,
} from '../framework/index.js';
import type { SearchProvider, ViewerConfig } from '../types/config.js';
import type { SdkPlugin } from '../types/plugin.js';
import type { PluginError } from '../types/plugin.js';
import type { ThemeConfig } from '../theme/types.js';
import type { ViewerStateSnapshot } from '../state/viewer.svelte.js';
import type { ViewerError } from '../types/viewerError.js';
import type { CanvasRegion } from '../utils/contentState.js';
import { claimTemplateRefOwnership } from './templateRefOwnership.js';

/**
 * Every viewer input `<TriiiceratopsViewer>` accepts, across the attribute and
 * property tiers. Ordinary host attributes are not props — they arrive as
 * `attrs` and are forwarded, which is Vue's normal contract for them.
 */
export type TriiiceratopsViewerProps = ViewerElementProps;

/**
 * The component's typed emits. Each carries the custom element's event DETAIL
 * directly — never a `CustomEvent` — so application code is independent of the
 * DOM event envelope, and the error channels carry the exact objects core
 * dispatched, including a callable `PluginError.retry()`.
 *
 * Usable with Vue's normal template casing: `@state-change`, `@canvas-change`,
 * `@manifest-change`, `@choice-change`, `@plugin-error`, `@viewer-error`.
 */
export interface ViewerEmits {
    /** Any inventoried viewer-state change, batched. */
    stateChange: [snapshot: ViewerStateSnapshot];
    /** The displayed canvas changed. */
    canvasChange: [snapshot: ViewerStateSnapshot];
    /** The loaded manifest changed. */
    manifestChange: [snapshot: ViewerStateSnapshot];
    /** A IIIF `Choice` selection changed. */
    choiceChange: [snapshot: ViewerStateSnapshot];
    /** A plugin failed. The exact `PluginError`, with a callable `retry()`. */
    pluginError: [error: PluginError];
    /** The viewer failed. The exact typed `ViewerError`. */
    viewerError: [error: ViewerError];
}

/** Which emit each custom-element channel feeds. */
const EMIT_BY_CHANNEL = {
    statechange: 'stateChange',
    canvaschange: 'canvasChange',
    manifestchange: 'manifestChange',
    choicechange: 'choiceChange',
    pluginerror: 'pluginError',
    viewererror: 'viewerError',
} as const satisfies Record<ViewerEventChannel, keyof ViewerEmits>;

/**
 * Runtime prop declarations. They exist so Vue can tell viewer inputs from host
 * attributes: anything declared here is a prop, everything else lands in
 * `attrs` and is forwarded to the element untouched.
 *
 * `searchProvider` accepts `null` even though its declared type is `Function`;
 * Vue skips type validation for a nullish value on an optional prop.
 */
const viewerProps = {
    manifestId: { type: String, required: false },
    canvasId: { type: String, required: false },
    theme: { type: String, required: false },
    manifestJson: {
        type: [String, Object] as PropType<string | Record<string, any>>,
        required: false,
    },
    themeConfig: {
        type: [String, Object] as PropType<string | ThemeConfig>,
        required: false,
    },
    config: {
        type: [String, Object] as PropType<string | ViewerConfig>,
        required: false,
    },
    initialCanvasRegion: {
        type: [String, Object] as PropType<string | CanvasRegion>,
        required: false,
    },
    plugins: {
        type: Array as PropType<readonly SdkPlugin[]>,
        required: false,
    },
    searchProvider: {
        // `Function` is the runtime check; the declared type also admits
        // `null`, which Vue's own validator skips for an optional prop, so the
        // constructor and the type genuinely do not overlap.
        type: Function as unknown as PropType<SearchProvider | null>,
        required: false,
    },
} as const;

/**
 * Runtime emit declarations, mirroring {@link ViewerEmits}.
 *
 * Vue derives the typed `onStateChange` / `onCanvasChange` / … handler props
 * from these validators, and their PARAMETER NAMES show up in the published
 * declarations and in consumer autocompletion — so they are named for the
 * reader, not `_`. Nothing is validated: the element is the only emitter and
 * every detail is already the exact object core dispatched.
 */
const viewerEmits = {
    stateChange: (snapshot: ViewerStateSnapshot): boolean => {
        void snapshot;
        return true;
    },
    canvasChange: (snapshot: ViewerStateSnapshot): boolean => {
        void snapshot;
        return true;
    },
    manifestChange: (snapshot: ViewerStateSnapshot): boolean => {
        void snapshot;
        return true;
    },
    choiceChange: (snapshot: ViewerStateSnapshot): boolean => {
        void snapshot;
        return true;
    },
    pluginError: (error: PluginError): boolean => {
        void error;
        return true;
    },
    viewerError: (error: ViewerError): boolean => {
        void error;
        return true;
    },
};

/**
 * The attribute tier as vnode props, each key `^`-prefixed.
 *
 * `patchProp` strips the marker and takes the `setAttribute` path
 * unconditionally, and `@vue/server-renderer` strips it too — so the server's
 * markup and every client render emit the identical attribute set regardless of
 * whether the element has been upgraded yet.
 */
function attributeTierProps(
    props: Readonly<ViewerAttributeProps>,
): Record<string, string> {
    const forced: Record<string, string> = {};
    for (const [attribute, value] of Object.entries(
        viewerElementAttributes(props),
    )) {
        forced[`^${attribute}`] = value;
    }
    return forced;
}

export const TriiiceratopsViewer = defineComponent({
    name: 'TriiiceratopsViewer',
    // Forwarded deliberately by the render function below, so a single-element
    // component still behaves predictably for `class`, `style`, and listeners.
    inheritAttrs: false,
    props: viewerProps,
    emits: viewerEmits,
    setup(props, { attrs, emit, expose }) {
        // Captured in `setup` so the mount hook can read the template ref Vue
        // recorded for THIS component (`instance.vnode.ref`) and take ownership
        // of the box it writes into. See `templateRefOwnership.ts`.
        const instance = getCurrentInstance();
        const elementRef = shallowRef<TriiiceratopsViewerElement | null>(null);
        // The current binding's handle. A REF, not a plain field: the exposed
        // `state` getter reads it, so a `computed` that touches
        // `viewer.value?.state` tracks it and rewires on every rebind.
        const handleRef = shallowRef<ViewerHandle | null>(null);
        const registrationError = shallowRef<unknown>(null);

        let controller: ViewerBindingController | null = null;
        let applier: ViewerPropApplier | null = null;
        let applierElement: TriiiceratopsViewerElement | null = null;
        let removeListeners: Array<() => void> = [];
        let releaseTemplateRef: (() => void) | null = null;

        /**
         * Write the property tier. The applier suppresses unchanged writes
         * itself, so re-running this on every reactive change is free.
         */
        const applyPropertyTier = (): void => {
            const element = elementRef.value;
            if (!element) return;
            if (!applier || applierElement !== element) {
                applier = createViewerPropApplier(element);
                applierElement = element;
            }
            applier.apply(props as Readonly<ViewerElementProps>);
        };

        // Post flush, so the element exists. Reading every property-tier prop
        // through the applier is what makes this effect track them all.
        watchEffect(applyPropertyTier, { flush: 'post' });

        // Registration rejected (no registry, or a foreign element already owns
        // the tag). Thrown from a watcher so it reaches `onErrorCaptured` and
        // `app.config.errorHandler` rather than the console.
        watch(registrationError, (error) => {
            if (error === null) return;
            throw error;
        });

        /**
         * Take the template ref, unless this viewer already holds it.
         *
         * Called from `onMounted` AND `onActivated`, because a `<KeepAlive>`
         * child gets both on its first mount and only the latter afterwards.
         * Idempotent so the pair never produces two leases on one box.
         */
        const claimTemplateRef = (
            element: TriiiceratopsViewerElement,
        ): void => {
            if (releaseTemplateRef) return;
            releaseTemplateRef = claimTemplateRefOwnership(instance, element);
        };

        /** Give the template ref back. Idempotent. */
        const releaseTemplateRefIfHeld = (): void => {
            releaseTemplateRef?.();
            releaseTemplateRef = null;
        };

        onMounted(() => {
            const element = elementRef.value;
            if (!element) return;

            // Ownership FIRST, like React's binding: one template ref put on
            // two viewers throws `TriiiceratopsHandleConflictError` naming both
            // elements, before this viewer listens or triggers registration.
            // Thrown from a lifecycle hook, so it reaches `onErrorCaptured` and
            // `app.config.errorHandler` rather than the console.
            claimTemplateRef(element);

            // Synchronously, before Svelte's `connectedCallback` reaches its
            // first microtask, so the inner viewer mounts with these values
            // already in place.
            applyPropertyTier();

            removeListeners = VIEWER_EVENT_CHANNELS.map((channel) => {
                const listener = (event: Event): void => {
                    (emit as (name: string, detail: unknown) => void)(
                        EMIT_BY_CHANNEL[channel],
                        (event as CustomEvent<unknown>).detail,
                    );
                };
                element.addEventListener(channel, listener);
                return (): void =>
                    element.removeEventListener(channel, listener);
            });

            controller = createViewerBinding({
                onChange: () => {
                    handleRef.value = controller?.handle ?? null;
                },
                onRegistrationError: (error: unknown) => {
                    registrationError.value = error;
                },
            });
            // Listen, trigger shared registration, then check for state that is
            // already available — all inside `attach`.
            controller.attach(element);
        });

        // `<KeepAlive>` never unmounts: it parks the component and Vue clears
        // the template ref for it, so a deactivated viewer no longer owns the
        // box and must not block the viewer that takes its place. Reactivation
        // re-fills the ref, so it takes ownership back — and legitimately
        // conflicts if some OTHER mounted viewer has claimed it meanwhile.
        // Registered unconditionally; outside a `<KeepAlive>` neither ever runs.
        onDeactivated(releaseTemplateRefIfHeld);
        onActivated(() => {
            const element = elementRef.value;
            if (element) claimTemplateRef(element);
        });

        onBeforeUnmount(() => {
            for (const remove of removeListeners) remove();
            removeListeners = [];
            // Give the template ref back, so an unmount/remount or a `v-if`
            // swap rebinds the same ref cleanly. Idempotent.
            releaseTemplateRefIfHeld();
            // Removes the availability listener, disposes this viewer's
            // selector runtime, and clears the binding. Idempotent.
            controller?.destroy();
            controller = null;
            handleRef.value = null;
            applier = null;
            applierElement = null;
        });

        // The imperative escape hatch, and the handle every composable reads
        // through. Exactly two members; both are getters over reactive sources.
        expose({
            get element(): TriiiceratopsViewerElement | null {
                return elementRef.value;
            },
            get state(): ViewerHandle['state'] | undefined {
                return handleRef.value?.state;
            },
        });

        return (): VNode =>
            h(VIEWER_ELEMENT_TAG, {
                ...attrs,
                ...attributeTierProps(props),
                ref: elementRef,
            });
    },
});
