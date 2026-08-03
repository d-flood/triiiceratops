/**
 * Static typing of `triiiceratops/vue`.
 *
 * These assertions are checked by `tsc` / `svelte-check` because this file is
 * in the package's program — a failing one breaks `pnpm check`, not just the
 * suite. `expectTypeOf` erases at runtime, so the `it` blocks below assert only
 * that the probes exist; the real assertions are the type expressions inside
 * them.
 *
 * The probe functions are declared and never called on purpose: a composable's
 * INFERRED return type is what is under test, and inference needs a real call
 * expression, not a runtime one.
 */

import { useTemplateRef } from 'vue';
import type { ComputedRef } from 'vue';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
    ReadonlyViewerState,
    SelectorCadence,
    TriiiceratopsViewerElement,
    TriiiceratopsViewerInstance,
    TriiiceratopsViewerProps,
    ViewerEmits,
    ViewerHandle,
    ViewerHandleRef,
    ViewerProviderProps,
    ViewerSelectorOptions,
    ViewerStateSnapshot,
} from '../vue.js';
import { TriiiceratopsViewer, useViewer, useViewerSelector } from '../vue.js';
import type { CanvasRegion } from '../utils/contentState.js';
import type { PluginError, SdkPlugin } from '../types/plugin.js';
import type { SearchProvider, ViewerConfig } from '../types/config.js';
import type { ThemeConfig } from '../theme/types.js';
import type { ViewerError } from '../types/viewerError.js';

/** True when `K` is a key of `T`. */
type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;

/** Everything the component accepts, as Vue derives it (props plus emits). */
type ComponentProps = InstanceType<typeof TriiiceratopsViewer>['$props'];

/** The parameters a derived emit-handler prop is called with. */
type EmitParams<K extends keyof ComponentProps> =
    NonNullable<ComponentProps[K]> extends (...args: infer A) => unknown
        ? A
        : never;

describe('component props', () => {
    it('types every viewer input across the two written tiers', () => {
        expectTypeOf<TriiiceratopsViewerProps['manifestId']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['canvasId']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['theme']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['manifestJson']>().toEqualTypeOf<
            string | Record<string, any> | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['themeConfig']>().toEqualTypeOf<
            string | ThemeConfig | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['config']>().toEqualTypeOf<
            string | ViewerConfig | undefined
        >();
        expectTypeOf<
            TriiiceratopsViewerProps['initialCanvasRegion']
        >().toEqualTypeOf<string | CanvasRegion | undefined>();
        expectTypeOf<
            TriiiceratopsViewerProps['searchProvider']
        >().toEqualTypeOf<SearchProvider | null | undefined>();
        expect(true).toBe(true);
    });

    it('accepts SDK plugins only, never a legacy Svelte plugin shape', () => {
        expectTypeOf<TriiiceratopsViewerProps['plugins']>().toEqualTypeOf<
            readonly SdkPlugin[] | undefined
        >();
        expect(true).toBe(true);
    });

    it('surfaces the same inputs on the component Vue derives', () => {
        expectTypeOf<ComponentProps['manifestId']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<ComponentProps['plugins']>().toEqualTypeOf<
            readonly SdkPlugin[] | undefined
        >();
        expectTypeOf<ComponentProps['searchProvider']>().toEqualTypeOf<
            SearchProvider | null | undefined
        >();
        expect(true).toBe(true);
    });
});

describe('emits', () => {
    it('carries the event detail on every channel, never a CustomEvent', () => {
        expectTypeOf<ViewerEmits['stateChange']>().toEqualTypeOf<
            [snapshot: ViewerStateSnapshot]
        >();
        expectTypeOf<ViewerEmits['canvasChange']>().toEqualTypeOf<
            [snapshot: ViewerStateSnapshot]
        >();
        expectTypeOf<ViewerEmits['manifestChange']>().toEqualTypeOf<
            [snapshot: ViewerStateSnapshot]
        >();
        expectTypeOf<ViewerEmits['choiceChange']>().toEqualTypeOf<
            [snapshot: ViewerStateSnapshot]
        >();
        expectTypeOf<ViewerEmits['pluginError']>().toEqualTypeOf<
            [error: PluginError]
        >();
        expectTypeOf<ViewerEmits['viewerError']>().toEqualTypeOf<
            [error: ViewerError]
        >();
        expect(true).toBe(true);
    });

    it('types the handler props Vue derives from them', () => {
        expectTypeOf<EmitParams<'onStateChange'>>().toEqualTypeOf<
            [ViewerStateSnapshot]
        >();
        expectTypeOf<EmitParams<'onCanvasChange'>>().toEqualTypeOf<
            [ViewerStateSnapshot]
        >();
        expectTypeOf<EmitParams<'onManifestChange'>>().toEqualTypeOf<
            [ViewerStateSnapshot]
        >();
        expectTypeOf<EmitParams<'onChoiceChange'>>().toEqualTypeOf<
            [ViewerStateSnapshot]
        >();
        expectTypeOf<EmitParams<'onPluginError'>>().toEqualTypeOf<
            [PluginError]
        >();
        expectTypeOf<EmitParams<'onViewerError'>>().toEqualTypeOf<
            [ViewerError]
        >();
        expect(true).toBe(true);
    });
});

describe('the template ref', () => {
    it('is the imperative contract: the element and its readonly state', () => {
        expectTypeOf<keyof TriiiceratopsViewerInstance>().toEqualTypeOf<
            'element' | 'state'
        >();
        expectTypeOf<
            TriiiceratopsViewerInstance['element']
        >().toEqualTypeOf<TriiiceratopsViewerElement>();
        expectTypeOf<TriiiceratopsViewerInstance['state']>().toEqualTypeOf<
            ReadonlyViewerState | undefined
        >();
        // A bound handle IS one of these; the instance only widens `state` to
        // cover the window before the viewer publishes it.
        expectTypeOf<ViewerHandle>().toMatchTypeOf<TriiiceratopsViewerInstance>();
        expectTypeOf(probeTemplateRef).toBeFunction();
        expect(true).toBe(true);
    });

    it('hides the four lifecycle-plumbing methods and keeps the commands', () => {
        expectTypeOf<
            Has<ReadonlyViewerState, 'setEventTarget'>
        >().toEqualTypeOf<false>();
        expectTypeOf<
            Has<ReadonlyViewerState, 'setViewerElement'>
        >().toEqualTypeOf<false>();
        expectTypeOf<
            Has<ReadonlyViewerState, 'destroy'>
        >().toEqualTypeOf<false>();
        expectTypeOf<
            Has<ReadonlyViewerState, 'destroyAllPlugins'>
        >().toEqualTypeOf<false>();

        expectTypeOf<
            Has<ReadonlyViewerState, 'setCanvas'>
        >().toEqualTypeOf<true>();
        expectTypeOf<
            Has<ReadonlyViewerState, 'toggleToolbar'>
        >().toEqualTypeOf<true>();
        expectTypeOf<
            Has<ReadonlyViewerState, 'canvasId'>
        >().toEqualTypeOf<true>();
        expect(true).toBe(true);
    });

    it('is what the provider takes', () => {
        expectTypeOf<
            ViewerProviderProps['value']
        >().toEqualTypeOf<ViewerHandleRef>();
        expectTypeOf<ViewerHandleRef['value']>().toEqualTypeOf<
            TriiiceratopsViewerInstance | null | undefined
        >();
        expect(true).toBe(true);
    });
});

describe('selector options and inference', () => {
    it('defaults nothing and types both options', () => {
        expectTypeOf<ViewerSelectorOptions<number>['equals']>().toEqualTypeOf<
            ((a: number, b: number) => boolean) | undefined
        >();
        expectTypeOf<ViewerSelectorOptions<number>['cadence']>().toEqualTypeOf<
            SelectorCadence | undefined
        >();
        expectTypeOf<SelectorCadence>().toEqualTypeOf<'state' | 'frame'>();
        expect(true).toBe(true);
    });

    it('infers the selected type from the projection, in both forms', () => {
        expectTypeOf(probeInference).toBeFunction();
        expect(true).toBe(true);
    });

    it('types the readonly-state composable', () => {
        expectTypeOf(probeViewerComposable).toBeFunction();
        expect(true).toBe(true);
    });
});

/** Never called: only its inferred types are under test. */
function probeTemplateRef(): void {
    const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
    expectTypeOf(
        viewer.value,
    ).toEqualTypeOf<TriiiceratopsViewerInstance | null>();
    expectTypeOf(viewer.value?.state).toEqualTypeOf<
        ReadonlyViewerState | undefined
    >();
    expectTypeOf(viewer.value?.element).toEqualTypeOf<
        TriiiceratopsViewerElement | undefined
    >();
    // A template ref is accepted wherever a handle is.
    expectTypeOf(viewer).toMatchTypeOf<ViewerHandleRef>();
}

/** Never called: only its inferred types are under test. */
function probeInference(viewer: ViewerHandleRef): void {
    expectTypeOf(
        useViewerSelector(viewer, (state) => state.canvasId),
    ).toEqualTypeOf<ComputedRef<string | null | undefined>>();
    expectTypeOf(
        useViewerSelector(viewer, (state) => state.toolbarOpen),
    ).toEqualTypeOf<ComputedRef<boolean | undefined>>();
    expectTypeOf(
        useViewerSelector(viewer, (state) => ({ id: state.canvasId })),
    ).toEqualTypeOf<ComputedRef<{ id: string | null } | undefined>>();
    // The projection is handed the READONLY view, so plumbing is not offered.
    expectTypeOf(
        useViewerSelector(viewer, (state) => {
            expectTypeOf(state).toEqualTypeOf<ReadonlyViewerState>();
            return state.dockSide;
        }),
    ).toEqualTypeOf<ComputedRef<string | undefined>>();
    // Options infer `T` from the projection too.
    expectTypeOf(
        useViewerSelector(viewer, (state) => state.currentCanvasIndex, {
            equals: (a, b) => a === b,
            cadence: 'frame',
        }),
    ).toEqualTypeOf<ComputedRef<number | undefined>>();
    // The one permitted overload: projection first, handle from injection.
    expectTypeOf(useViewerSelector((state) => state.canvasId)).toEqualTypeOf<
        ComputedRef<string | null | undefined>
    >();
    expectTypeOf(
        useViewerSelector((state) => state.currentCanvasIndex, {
            cadence: 'frame',
        }),
    ).toEqualTypeOf<ComputedRef<number | undefined>>();
}

/** Never called: only its inferred types are under test. */
function probeViewerComposable(viewer: ViewerHandleRef): void {
    expectTypeOf(useViewer(viewer)).toEqualTypeOf<
        ComputedRef<ReadonlyViewerState | undefined>
    >();
    expectTypeOf(useViewer()).toEqualTypeOf<
        ComputedRef<ReadonlyViewerState | undefined>
    >();
}
