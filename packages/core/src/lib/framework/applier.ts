/**
 * The ONE property-tier applier both framework wrappers use.
 *
 * It exists because "assign an object prop to a custom element" has three
 * hazards that are easy to get wrong once per framework:
 *
 * 1. **It must not wait for registration.** Svelte's custom element ports
 *    properties assigned BEFORE upgrade into its props record on connect
 *    (`custom-element.js` `connectedCallback`), so imperative assignment is
 *    safe in either order. Gating assignment on the element bundle's dynamic
 *    import would gate first paint on a network round trip for no benefit —
 *    and, in Vue, routing these values through vnode props instead would let
 *    `shouldSetAsProp` fall back to `setAttribute(key, String(value))` on a
 *    not-yet-defined element, stringifying a manifest or a search function.
 * 2. **Clearing a value before upgrade must DELETE, not assign `undefined`.**
 *    That same porting loop skips keys whose value is `undefined`, so an
 *    `undefined` assigned before upgrade is never ported and never removed. The
 *    own property then shadows the prototype accessor permanently and every
 *    later assignment silently stops reaching the component.
 * 3. **Writes are edge-triggered against the PROP value, never the element's
 *    state.** Re-asserting an unchanged value after the viewer has moved on —
 *    the user navigated, so `canvas-id` reflects something else — must write
 *    nothing. Otherwise every parent re-render would reload the manifest, snap
 *    the viewport, or restart the plugins.
 *
 * Change detection is the uniform one-level {@link shallowEqual}. It never
 * inspects a value's contents beyond one level and never branches on which prop
 * is being written.
 *
 * One value IS read on its way past: `config.debug`. Writing it is not enough,
 * because the element bundle configures its own inlined logger and the wrapper
 * side is a separate module instance — so the applier is also where
 * `ViewerConfig.debug` is bridged to the logger these wrappers warn through
 * (see {@link bridgeViewerDebugFlag}). That is a side effect of the WRITE, not
 * of change detection: an unchanged `config` still writes nothing and bridges
 * nothing.
 */

import { logger } from '../logging/logger.js';
import { bridgeViewerDebugFlag } from './debugFlag.js';
import {
    shallowEqual,
    VIEWER_PROPERTY_PROPS,
    type ViewerElementProps,
    type ViewerPropertyPropName,
} from './props.js';
import type { TriiiceratopsViewerElement } from '../types/viewerElement.js';

/**
 * How many writes of a single property-tier input over one wrapper's lifetime
 * are implausible enough to name in development. Exceeding it almost always
 * means an object or function prop is rebuilt on every parent render.
 */
export const PROPERTY_WRITE_WARNING_THRESHOLD = 10;

export interface ViewerPropApplierOptions {
    /** Override the development warn-once threshold. Mainly for tests. */
    warnThreshold?: number;
}

export interface ViewerPropApplier {
    /**
     * Apply the current props. Attribute-tier keys in the same object are
     * ignored — wrappers render those declaratively — so a wrapper can pass its
     * whole props object unchanged.
     *
     * Safe to call before the element is registered, before it is connected,
     * and on every render.
     */
    apply(props: Readonly<ViewerElementProps>): void;
}

/**
 * Create the property-tier applier for one element. One applier per mounted
 * wrapper: its memory of previously applied values IS the edge-trigger, and its
 * per-prop write counters back the development warning.
 */
export function createViewerPropApplier(
    element: TriiiceratopsViewerElement,
    options: ViewerPropApplierOptions = {},
): ViewerPropApplier {
    const threshold = options.warnThreshold ?? PROPERTY_WRITE_WARNING_THRESHOLD;
    // The last value APPLIED for each prop — not the element's current state.
    const applied = new Map<ViewerPropertyPropName, unknown>();
    const writes = new Map<ViewerPropertyPropName, number>();
    const warned = new Set<ViewerPropertyPropName>();
    const target = element as unknown as Record<string, unknown>;

    function write(prop: ViewerPropertyPropName, value: unknown): void {
        if (prop === 'config') {
            // The element bundle configures its OWN inlined logger from
            // `config.debug`; this configures the wrapper-side one, which is a
            // different module instance in the published package and is what
            // gates every development warning a framework consumer can hit.
            // Edge-triggered like the write itself, so re-asserting an equal
            // config re-asserts nothing. See `./debugFlag.ts` for what happens
            // with a JSON string, an absent `config`, a `config` that changes
            // after mount, and two wrappers that disagree.
            bridgeViewerDebugFlag(value);
        }
        if (value === undefined) {
            // Hazard 2: never leave an `undefined` own property shadowing the
            // prototype accessor on a not-yet-upgraded element.
            if (Object.prototype.hasOwnProperty.call(target, prop)) {
                Reflect.deleteProperty(target, prop);
            } else {
                target[prop] = undefined;
            }
        } else {
            target[prop] = value;
        }

        const count = (writes.get(prop) ?? 0) + 1;
        writes.set(prop, count);
        if (count > threshold && !warned.has(prop)) {
            warned.add(prop);
            logger.warn(
                `The \`${prop}\` viewer prop has been re-assigned ${count} times ` +
                    `on one <triiiceratops-viewer>. Property-tier inputs are ` +
                    `compared with a one-level shallow equality, so a value that ` +
                    `is rebuilt on every render is written every render — which ` +
                    `can reload the manifest, move the viewport, or restart ` +
                    `plugins. Hoist the value, memoize it, or keep its identity ` +
                    `stable between renders.`,
            );
        }
    }

    return {
        apply(props: Readonly<ViewerElementProps>): void {
            for (const prop of VIEWER_PROPERTY_PROPS) {
                const next = props[prop];
                if (applied.has(prop)) {
                    // Edge-triggered: compare against what WE last applied.
                    if (shallowEqual(applied.get(prop), next)) continue;
                } else if (next === undefined) {
                    // Nothing has ever been applied and nothing is being asked
                    // for: writing would only risk hazard 2.
                    applied.set(prop, undefined);
                    continue;
                }
                applied.set(prop, next);
                write(prop, next);
            }
        },
    };
}
