import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DrawingLayer from './DrawingLayer.svelte';
import { DrawingSession } from './drawingSession.svelte';
import type { AnnotationStore } from './AnnotationStore.svelte';
import type { MirroredViewerState } from './viewerMirror.svelte';

const viewerState = {
    subscribeFrame: () => () => {},
    canvasToScreen: () => null,
    screenToCanvas: () => null,
    annotatableCanvasIds: [],
    annotationEditBus: { activeEditAnnotationId: null, requestEdit: () => {} },
} as unknown as MirroredViewerState;

/** A viewer whose chrome lives in a shadow root, as the custom element's does. */
function shadowViewer() {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    const field = document.createElement('textarea');
    const button = document.createElement('button');
    shadow.append(container, field, button);

    const session = new DrawingSession();
    session.armedTool = 'rectangle';
    const layer = mount(DrawingLayer, {
        target: container,
        props: {
            session,
            store: {} as AnnotationStore,
            viewerState,
        },
    });
    flushSync();
    return { host, field, button, layer };
}

function pressSpace(target: HTMLElement): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        composed: true,
        cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
}

describe('DrawingLayer keyboard inside a shadow root', () => {
    let cleanup: (() => void) | null = null;

    beforeEach(() => {
        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
            },
        );
    });

    afterEach(() => {
        cleanup?.();
        cleanup = null;
        vi.unstubAllGlobals();
    });

    it('leaves Space to a text field while a tool is armed', () => {
        const { host, field, layer } = shadowViewer();
        cleanup = () => {
            void unmount(layer);
            host.remove();
        };

        expect(pressSpace(field).defaultPrevented).toBe(false);
    });

    it('still takes Space from anything that is not a text field', () => {
        const { host, button, layer } = shadowViewer();
        cleanup = () => {
            void unmount(layer);
            host.remove();
        };

        expect(pressSpace(button).defaultPrevented).toBe(true);
    });
});
