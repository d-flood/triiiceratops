/**
 * The point marker's size, which is a theme token and therefore a length in the
 * stylesheet rather than a number in the configuration.
 *
 * A point looks the same whether it is rendered read-only (the viewer's shape
 * overlay), selected, or edited, so both sides resolve it here (spec §3.4).
 * They need the number as well as the paint: the overlay positions a marker
 * from its own geometry and measures a tap against the marker's diameter, and
 * the editor sizes the handle that stands in for one.
 *
 * Measured rather than parsed. A custom property's computed value is the text
 * the author wrote — `getPropertyValue` hands back `0.625rem`, not `10px` — so
 * the only honest way to a pixel count is to let CSS resolve the length on a
 * real element. The probe is one zero-height div per viewer, and a
 * `ResizeObserver` on it means a theme change, a `themeConfig` update, or a
 * host stylesheet moving the token all arrive the same way, without anything
 * polling and without a style read per tap.
 */

/** The token every point marker is drawn and measured from. */
export const POINT_SIZE_TOKEN = '--tri-annotation-point-size';

/**
 * Marker diameter in CSS pixels when the token resolves to nothing usable —
 * a detached scope, or a host that set it to a bad value. The stylesheet's own
 * default, so the fallback and the theme agree.
 */
export const DEFAULT_POINT_DIAMETER = 10;

/**
 * Watch the marker diameter in `scope`, calling `onChange` with the resolved
 * width in CSS pixels — now, and whenever the token's value moves.
 *
 * Returns a teardown that removes the probe and stops observing.
 */
export function observePointDiameter(
    scope: HTMLElement,
    onChange: (diameter: number) => void,
): () => void {
    const probe = document.createElement('div');
    // Out of flow, no ink, no input: it exists to have a width CSS has
    // resolved. `position: absolute` keeps it from taking a line box in a
    // layer whose children are positioned.
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position:absolute;top:0;left:0;height:0;width:var(${POINT_SIZE_TOKEN});pointer-events:none;visibility:hidden;`;
    scope.appendChild(probe);

    const report = () => {
        const width = probe.getBoundingClientRect().width;
        onChange(width > 0 ? width : DEFAULT_POINT_DIAMETER);
    };

    const observer = new ResizeObserver(report);
    observer.observe(probe);
    report();

    return () => {
        observer.disconnect();
        probe.remove();
    };
}
