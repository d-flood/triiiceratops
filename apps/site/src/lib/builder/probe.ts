function toHex(value: string): string {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '#000000';

    // Tokens are oklch; the bitmap is sRGB.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function toPixels(probe: HTMLElement, value: string): number {
    probe.style.outlineOffset = value;
    const computed = parseFloat(getComputedStyle(probe).outlineOffset);
    probe.style.outlineOffset = '';
    return Number.isFinite(computed) ? computed : 0;
}

export function readTokenValues(
    probe: HTMLElement,
    colours: readonly string[],
    lengths: readonly string[],
    percents: readonly string[] = [],
): {
    colours: Record<string, string>;
    lengths: Record<string, number>;
    percents: Record<string, number>;
} {
    const computed = getComputedStyle(probe);
    const raw = (name: string) => computed.getPropertyValue(name).trim();

    return {
        colours: Object.fromEntries(
            colours.map((name) => [name, toHex(raw(name))]),
        ),
        lengths: Object.fromEntries(
            lengths.map((name) => [name, toPixels(probe, raw(name))]),
        ),
        percents: Object.fromEntries(
            percents.map((name) => [name, parseFloat(raw(name)) || 0]),
        ),
    };
}
