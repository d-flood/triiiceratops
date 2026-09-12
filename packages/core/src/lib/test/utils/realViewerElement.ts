/**
 * Harness for driving the REAL `<triiiceratops-viewer>` custom element in the
 * happy-dom vitest environment.
 *
 * The framework-wrapper tests deliberately use the real compiled element rather
 * than an idealized double, because every hazard worth testing lives in the
 * element's own semantics: Svelte's asynchronous `connectedCallback`, the
 * porting of properties assigned before upgrade, kebab attribute mapping, the
 * getter-only state bridge, and the destroy/re-mount cycle a detach-then-
 * reattach produces. A double would agree with whatever the wrapper assumed.
 *
 * Test-only: `src/lib/test/**` is removed from `dist` by `pruneDist`.
 */

import { tick } from 'svelte';

import TriiiceratopsViewerElementComponent from '../../components/TriiiceratopsViewerElement.svelte';
import type { ViewerState } from '../../state/viewer.svelte';

/** The tag both Web Component entries register. */
export const VIEWER_TAG = 'triiiceratops-viewer';

/**
 * The custom-element class the Svelte compiler produced for the wrapper —
 * exactly what `custom-element.ts` / `element.ts` hand to the browser runtime.
 */
export const RealViewerElementCtor = (
    TriiiceratopsViewerElementComponent as unknown as {
        element: CustomElementConstructor;
    }
).element;

/** The element as a test sees it: the bridge plus the property-tier inputs. */
export interface RealViewerElement extends HTMLElement {
    readonly viewerState: ViewerState | undefined;
    manifestId?: string;
    canvasId?: string;
    theme?: string;
    manifestJson?: unknown;
    themeConfig?: unknown;
    config?: unknown;
    initialCanvasRegion?: unknown;
    plugins?: unknown;
    searchProvider?: unknown;
}

/**
 * happy-dom ships an incomplete Web Animations API; Svelte transitions call
 * `element.animate()` and the missing pieces throw mid-flush, aborting effects
 * scheduled after the throw. A no-op animation keeps transitions inert.
 */
export function installInertAnimations(): void {
    Element.prototype.animate = function () {
        return {
            onfinish: null,
            oncancel: null,
            cancel() {},
            finish() {},
            play() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            finished: Promise.resolve(),
            currentTime: 0,
            playState: 'finished',
        } as unknown as Animation;
    };
}

let definedTag: string | null = null;

/** Register the real element once per test file (the registry is per file). */
export function defineRealViewerElement(): CustomElementConstructor {
    if (definedTag !== VIEWER_TAG) {
        customElements.define(VIEWER_TAG, RealViewerElementCtor);
        definedTag = VIEWER_TAG;
    }
    return RealViewerElementCtor;
}

/** Whether {@link defineRealViewerElement} has run in this file. */
export function isRealViewerElementDefined(): boolean {
    return definedTag === VIEWER_TAG;
}

/**
 * Svelte's `connectedCallback` awaits a microtask before mounting, effects
 * flush after that, and the availability event is dispatched from a further
 * microtask.
 */
export async function settle(ms = 50): Promise<void> {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}
