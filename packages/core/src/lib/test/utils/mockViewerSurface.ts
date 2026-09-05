/**
 * Gives a mounted viewer a measurable surface under happy-dom, which has no
 * layout, no 2D canvas context and no working `ResizeObserver`.
 *
 * The renderer refuses to lay anything out without both: an unmeasured
 * container never places a canvas, and `paint()` returns early with no context.
 * The box is mutable so a test can narrow the surface mid-run and model a
 * panel's slide through its intermediate widths.
 *
 * Test-only: `src/lib/test/**` is removed from `dist` by `pruneDist`.
 */

import { tick } from 'svelte';

export interface SurfaceBox {
    x?: number;
    y?: number;
    width: number;
    height: number;
}

export interface ViewerSurface {
    /** Resize the box every element reports from `getBoundingClientRect`. */
    setBox(box: SurfaceBox): void;
    /** Walk the box through `boxes`, driving a frame after each one. */
    stepBox(boxes: SurfaceBox[]): Promise<void>;
    restore(): void;
}

const DEFAULT_BOX: Required<SurfaceBox> = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
};

/**
 * Let the renderer's `requestAnimationFrame` loop observe the new box.
 *
 * One frame is enough only because the renderer's size sampler is already
 * pending when the box changes — it re-registers itself every frame from the
 * mount onward. A consumer that starts sampling later in the same frame would
 * first observe the *next* size, dropping this one.
 */
async function nextFrame(): Promise<void> {
    await tick();
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
    });
    await tick();
}

/**
 * Patch `Element.prototype.getBoundingClientRect` so **every** element reports
 * the surface box, plus the 2D context, `scrollIntoView` and `ResizeObserver`
 * the mount path needs. Call `restore()` in an `afterEach`.
 */
export function installViewerSurface(initial?: SurfaceBox): ViewerSurface {
    let box: Required<SurfaceBox> = { ...DEFAULT_BOX, ...initial };

    const originals = {
        rect: Element.prototype.getBoundingClientRect,
        context: HTMLCanvasElement.prototype.getContext,
        scrollIntoView: Element.prototype.scrollIntoView,
        resizeObserver: globalThis.ResizeObserver,
    };

    /**
     * happy-dom's `ResizeObserver` is a stub — `observe`, `unobserve` and
     * `disconnect` are all bodied `// TODO: Not implemented` — so without this
     * nothing in a mounted viewer ever hears that the box moved. The renderer
     * has a second sampler, but it runs only while a docked-chrome
     * compensation is in flight, which leaves a surface change with nothing
     * docked silently unobserved: the branch that handles a window resize is
     * unreachable and specs about it pass over a viewer that was never
     * re-measured.
     */
    interface Registration {
        callback: ResizeObserverCallback;
        elements: Set<Element>;
        observer: ResizeObserver;
    }

    const observers = new Set<Registration>();

    class BoxObserver implements ResizeObserver {
        #entry: Registration;

        constructor(callback: ResizeObserverCallback) {
            this.#entry = { callback, elements: new Set(), observer: this };
        }

        observe(target: Element) {
            this.#entry.elements.add(target);
            observers.add(this.#entry);
        }

        unobserve(target: Element) {
            this.#entry.elements.delete(target);
            if (this.#entry.elements.size === 0) observers.delete(this.#entry);
        }

        disconnect() {
            this.#entry.elements.clear();
            observers.delete(this.#entry);
        }
    }

    /**
     * Notify every observer of the elements it watches.
     *
     * Not fired on `observe()`, unlike a real one: the renderer measures by hand
     * immediately after observing, and a second measurement of the same box
     * would only be indistinguishable noise. Fired for a box CHANGE, which is
     * the event the real observer delivers and the one the viewer needs.
     */
    function notifyObservers() {
        for (const { callback, elements, observer } of [...observers]) {
            const entries = [...elements].map(
                (target) =>
                    ({
                        target,
                        contentRect: target.getBoundingClientRect(),
                        borderBoxSize: [],
                        contentBoxSize: [],
                        devicePixelContentBoxSize: [],
                    }) as unknown as ResizeObserverEntry,
            );
            if (entries.length > 0) callback(entries, observer);
        }
    }

    Element.prototype.getBoundingClientRect = function () {
        return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            top: box.y,
            left: box.x,
            right: box.x + box.width,
            bottom: box.y + box.height,
            toJSON: () => ({}),
        } as DOMRect;
    };

    HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
    ) {
        const drawn: Record<string | symbol, unknown> = { canvas: this };
        return new Proxy(drawn, {
            get(store, property) {
                if (property in store) return store[property];
                if (property === 'measureText') return () => ({ width: 0 });
                return () => undefined;
            },
            set(store, property, value) {
                store[property] = value;
                return true;
            },
        }) as unknown as CanvasRenderingContext2D;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;

    Element.prototype.scrollIntoView = function () {};

    globalThis.ResizeObserver = BoxObserver;

    return {
        setBox(next) {
            box = { ...box, ...next };
            // Synchronously, unlike `stepBox`: `setBox` has no frame to sit in
            // and its callers arrange the box before anything is mounted, when
            // there is nothing observing it.
            notifyObservers();
        },
        async stepBox(boxes) {
            for (const next of boxes) {
                box = { ...box, ...next };
                // The tick FIRST, then the observers: a real observation is
                // delivered in the frame's rendering steps, by which time any
                // state a test set in the same tick as the resize — the flag
                // that says core docked chrome, and not the reader — has
                // reached the renderer. Notifying before it would hand every
                // panel open to the window-resize branch.
                await tick();
                notifyObservers();
                await nextFrame();
            }
        },
        restore() {
            Element.prototype.getBoundingClientRect = originals.rect;
            HTMLCanvasElement.prototype.getContext = originals.context;
            Element.prototype.scrollIntoView = originals.scrollIntoView;
            globalThis.ResizeObserver = originals.resizeObserver;
        },
    };
}
