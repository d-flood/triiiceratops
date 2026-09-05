/**
 * The value each theming token starts at, read out of the viewer's own
 * stylesheet.
 *
 * A swatch has to open on the colour the viewer is actually painting with, and
 * a slider has to start at the radius it actually has, or the first nudge of
 * either jumps. Both are read from a probe element carrying the viewer's theme
 * attribute rather than transcribed here, so there is no second copy of the
 * palette to drift: the viewer's defaults change and this follows them.
 *
 * The probe is not the preview. The reader's own overrides are applied to the
 * preview as inline style, and reading through them would make every untouched
 * swatch follow whichever token the reader had just moved.
 */

/** `<input type="color">` takes `#rrggbb` and nothing else. */
function toHex(value: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '#000000';

    // Painting and reading back is the conversion: the tokens are authored in
    // oklch, the canvas bitmap is sRGB, and `fillStyle`'s own serialization is
    // not guaranteed to leave a wide-gamut colour space.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A CSS length in pixels. Read back through a property that computes to a
 * length and lays nothing out, so resolving `0.5rem` costs no reflow of the
 * page around the probe.
 */
function toPixels(probe: HTMLElement, value: string): number {
    probe.style.outlineOffset = value;
    const computed = parseFloat(getComputedStyle(probe).outlineOffset);
    probe.style.outlineOffset = '';
    return Number.isFinite(computed) ? computed : 0;
}

/**
 * Every named token's current value on the probe, as a hex colour or a pixel
 * count according to what the caller asked for.
 */
export function readTokenValues(
    probe: HTMLElement,
    colours: readonly string[],
    lengths: readonly string[],
): { colours: Record<string, string>; lengths: Record<string, number> } {
    const computed = getComputedStyle(probe);
    const raw = (name: string) => computed.getPropertyValue(name).trim();

    return {
        colours: Object.fromEntries(
            colours.map((name) => [name, toHex(raw(name))]),
        ),
        lengths: Object.fromEntries(
            lengths.map((name) => [name, toPixels(probe, raw(name))]),
        ),
    };
}
