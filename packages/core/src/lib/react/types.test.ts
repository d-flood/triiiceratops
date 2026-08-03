/**
 * Static typing of `triiiceratops/react`.
 *
 * These assertions are checked by `tsc` / `svelte-check` because this file is
 * in the package's program — a failing one breaks `pnpm check`, not just the
 * suite. `expectTypeOf` erases at runtime, so the `it` blocks below assert only
 * that the probes exist; the real assertions are the type expressions inside
 * them.
 *
 * The probe components are declared and never called on purpose: a hook's
 * INFERRED return type is what is under test, and inference needs a real call
 * expression, not a runtime one.
 */

import type { Ref, RefObject } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
    ReadonlyViewerState,
    SelectorCadence,
    TriiiceratopsViewerElement,
    TriiiceratopsViewerProps,
    ViewerHandle,
    ViewerHandleSlot,
    ViewerSelectorOptions,
    ViewerStateSnapshot,
} from '../react.js';
import { useViewer, useViewerHandle, useViewerSelector } from '../react.js';
import type { CanvasRegion } from '../utils/contentState.js';
import type { PluginError, SdkPlugin } from '../types/plugin.js';
import type { SearchProvider, ViewerConfig } from '../types/config.js';
import type { ThemeConfig } from '../theme/types.js';
import type { ViewerError } from '../types/viewerError.js';

/** True when `K` is a key of `T`. */
type Has<T, K extends PropertyKey> = K extends keyof T ? true : false;

describe('component props', () => {
    it('types every viewer input across the three tiers', () => {
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

    it('forwards standard host attributes', () => {
        expectTypeOf<TriiiceratopsViewerProps['className']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['id']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<
            Has<TriiiceratopsViewerProps, 'style'>
        >().toEqualTypeOf<true>();
        expectTypeOf<
            Has<TriiiceratopsViewerProps, 'aria-label'>
        >().toEqualTypeOf<true>();
        expectTypeOf<
            Has<TriiiceratopsViewerProps, 'data-analytics-id'>
        >().toEqualTypeOf<true>();
        expect(true).toBe(true);
    });

    it('reserves children and types the handle and ref', () => {
        expectTypeOf<
            TriiiceratopsViewerProps['children']
        >().toEqualTypeOf<undefined>();
        expectTypeOf<TriiiceratopsViewerProps['handle']>().toEqualTypeOf<
            ViewerHandleSlot | null | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['ref']>().toEqualTypeOf<
            Ref<ViewerHandle | null> | undefined
        >();
        expectTypeOf<RefObject<ViewerHandle | null>>().toMatchTypeOf<
            Ref<ViewerHandle | null>
        >();
        expect(true).toBe(true);
    });

    it('hands each callback its event detail, never a CustomEvent', () => {
        expectTypeOf<TriiiceratopsViewerProps['onStateChange']>().toEqualTypeOf<
            ((snapshot: ViewerStateSnapshot) => void) | undefined
        >();
        expectTypeOf<
            TriiiceratopsViewerProps['onCanvasChange']
        >().toEqualTypeOf<
            ((snapshot: ViewerStateSnapshot) => void) | undefined
        >();
        expectTypeOf<
            TriiiceratopsViewerProps['onManifestChange']
        >().toEqualTypeOf<
            ((snapshot: ViewerStateSnapshot) => void) | undefined
        >();
        expectTypeOf<
            TriiiceratopsViewerProps['onChoiceChange']
        >().toEqualTypeOf<
            ((snapshot: ViewerStateSnapshot) => void) | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['onPluginError']>().toEqualTypeOf<
            ((error: PluginError) => void) | undefined
        >();
        expectTypeOf<TriiiceratopsViewerProps['onViewerError']>().toEqualTypeOf<
            ((error: ViewerError) => void) | undefined
        >();
        expect(true).toBe(true);
    });
});

describe('the imperative contract', () => {
    it('is exactly the element and its readonly state', () => {
        expectTypeOf<keyof ViewerHandle>().toEqualTypeOf<'element' | 'state'>();
        expectTypeOf<
            ViewerHandle['element']
        >().toEqualTypeOf<TriiiceratopsViewerElement>();
        expectTypeOf<
            ViewerHandle['state']
        >().toEqualTypeOf<ReadonlyViewerState>();
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

    it('infers the selected type from the projection', () => {
        expectTypeOf(probeInference).toBeFunction();
        expect(true).toBe(true);
    });

    it('types the handle hook and the readonly state hook', () => {
        expectTypeOf(useViewerHandle).returns.toEqualTypeOf<ViewerHandleSlot>();
        expectTypeOf(probeHandleHooks).toBeFunction();
        expect(true).toBe(true);
    });
});

/** Never called: only its inferred types are under test. */
function probeInference(handle: ViewerHandleSlot): void {
    expectTypeOf(
        useViewerSelector(handle, (state) => state.canvasId),
    ).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(
        useViewerSelector(handle, (state) => state.toolbarOpen),
    ).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(
        useViewerSelector(handle, (state) => ({ id: state.canvasId })),
    ).toEqualTypeOf<{ id: string | null } | undefined>();
    // The projection is handed the READONLY view, so plumbing is not offered.
    expectTypeOf(
        useViewerSelector(handle, (state) => {
            expectTypeOf(state).toEqualTypeOf<ReadonlyViewerState>();
            return state.dockSide;
        }),
    ).toEqualTypeOf<string | undefined>();
    // Options infer `T` from the projection too.
    expectTypeOf(
        useViewerSelector(handle, (state) => state.currentCanvasIndex, {
            equals: (a, b) => a === b,
            cadence: 'frame',
        }),
    ).toEqualTypeOf<number | undefined>();
    // Context form: projection first, no handle.
    expectTypeOf(useViewerSelector((state) => state.canvasId)).toEqualTypeOf<
        string | null | undefined
    >();
}

/** Never called: only its inferred types are under test. */
function probeHandleHooks(handle: ViewerHandleSlot): void {
    expectTypeOf(useViewer(handle)).toEqualTypeOf<
        ReadonlyViewerState | undefined
    >();
    expectTypeOf(useViewer()).toEqualTypeOf<ReadonlyViewerState | undefined>();
    expectTypeOf(handle.get()).toEqualTypeOf<ViewerHandle | null>();
}
