import type { ImageFilters } from './types';

/**
 * Minimal structural type for the bit of OpenSeadragon this plugin touches. The
 * plugin declares the `osd@5` capability and receives the raw viewer through
 * `ViewerState.osdViewer` (ADR 0009 pass-through); we only need its drawer
 * canvas. `drawer.canvas` is widened to `HTMLElement` because OSD's HTML drawer
 * uses a `<div>` while the canvas/webgl drawers use a `<canvas>`.
 */
interface OSDLike {
    drawer?: {
        canvas?: HTMLCanvasElement | HTMLElement;
    };
}

/**
 * Apply CSS filters to the OpenSeadragon canvas element. CSS filters are
 * GPU-accelerated and work without modifying OSD internals. Passing the neutral
 * (default) filters clears the filter.
 */
export function applyFilters(viewer: unknown, filters: ImageFilters): void {
    const canvas = (viewer as OSDLike)?.drawer?.canvas as
        | HTMLElement
        | undefined;
    if (!canvas) return;

    const parts: string[] = [];

    if (filters.brightness !== 100) {
        parts.push(`brightness(${filters.brightness / 100})`);
    }
    if (filters.contrast !== 100) {
        parts.push(`contrast(${filters.contrast / 100})`);
    }
    if (filters.saturation !== 100) {
        parts.push(`saturate(${filters.saturation / 100})`);
    }
    if (filters.invert) {
        parts.push('invert(1)');
    }
    if (filters.grayscale) {
        parts.push('grayscale(1)');
    }

    canvas.style.filter = parts.length > 0 ? parts.join(' ') : 'none';
}
