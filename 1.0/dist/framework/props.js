/**
 * The shared, framework-neutral prop metadata every viewer input is classified
 * by, and the change detection the applier uses.
 *
 * Three tiers, and the tier is a property of the INPUT, never of the runtime
 * value it happens to carry:
 *
 * - **Attribute tier** (`manifestId`, `canvasId`, `theme`) — rendered
 *   declaratively as kebab-case attributes by each wrapper, on the server and
 *   on the client's first render alike, so hydration reuses the same host with
 *   no mismatch. {@link viewerElementAttributes} builds that record; it is a
 *   pure function of the props, which is exactly why server and client agree.
 * - **Property tier** (`manifestJson`, `themeConfig`, `config`,
 *   `initialCanvasRegion`, `plugins`, `searchProvider`) — assigned imperatively
 *   as element properties by the applier, never server-rendered. The four
 *   inputs that accept a string OR an object route here UNCONDITIONALLY:
 *   assignment must never branch on the runtime type of a value, or the same
 *   prop would take different paths on different renders.
 * - **Host attributes** (`class`/`className`, `style`, `id`, `data-*`,
 *   `aria-*`, ordinary DOM attributes) — forwarded declaratively by each
 *   wrapper. They need no metadata here; they are simply not viewer inputs.
 *
 * `viewerState` is never a prop and never assigned (it is getter-only anyway).
 */
/**
 * Attribute-tier inputs and the kebab-case attribute each renders as. Iteration
 * order is the render order, so the two wrappers emit attributes identically.
 */
export const VIEWER_ATTRIBUTE_PROPS = {
    manifestId: 'manifest-id',
    canvasId: 'canvas-id',
    theme: 'theme',
};
/** Property-tier inputs, in the order the applier writes them. */
export const VIEWER_PROPERTY_PROPS = [
    'manifestJson',
    'themeConfig',
    'config',
    'initialCanvasRegion',
    'plugins',
    'searchProvider',
];
/** The tier of a viewer input, or `undefined` if it is not a viewer input. */
export function viewerPropTier(name) {
    if (name in VIEWER_ATTRIBUTE_PROPS)
        return 'attribute';
    if (VIEWER_PROPERTY_PROPS.includes(name)) {
        return 'property';
    }
    return undefined;
}
/**
 * Build the attribute-tier record a wrapper renders declaratively. Pure: the
 * same props always produce the same record, which is what makes the server's
 * markup and the client's first render agree with no readiness special case.
 *
 * Absent inputs are omitted rather than rendered empty, so a viewer configured
 * only by properties emits a bare host.
 */
export function viewerElementAttributes(props) {
    const attributes = {};
    for (const [name, attribute] of Object.entries(VIEWER_ATTRIBUTE_PROPS)) {
        const value = props[name];
        if (value === undefined || value === null)
            continue;
        attributes[attribute] = String(value);
    }
    return attributes;
}
/**
 * The ONE change-detection rule for property-tier inputs: one uniform,
 * one-level shallow comparison.
 *
 * Equal when the values are identical by `Object.is`; or both arrays of equal
 * length whose elements are identical by `Object.is`; or both plain objects
 * with equal own-key sets whose values are identical by `Object.is`. Everything
 * else is unequal.
 *
 * Deep equality, serialization comparison, and value-specific identity
 * heuristics are deliberately excluded: they make write suppression depend on
 * the SHAPE of a consumer's data, which is unpredictable and expensive. A
 * consumer whose object is nested and freshly built each render gets a write,
 * and — after enough of them — a development warning naming the prop.
 */
export function shallowEqual(a, b) {
    if (Object.is(a, b))
        return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b))
            return false;
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++) {
            if (!Object.is(a[i], b[i]))
                return false;
        }
        return true;
    }
    if (!isPlainObject(a) || !isPlainObject(b))
        return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length)
        return false;
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(b, key))
            return false;
        if (!Object.is(a[key], b[key]))
            return false;
    }
    return true;
}
/**
 * A plain data object — `{}` or `Object.create(null)`. Class instances,
 * functions, `Map`/`Set`, and `Date` are excluded on purpose: comparing their
 * own enumerable keys says nothing useful about equality, so they fall back to
 * `Object.is`.
 */
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
