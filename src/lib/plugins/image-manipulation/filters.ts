import type { ImageFilters } from './types';

// Minimal local type to avoid reliance on missing OpenSeadragon typings.
type OSDViewer = {
    drawer?: {
        canvas?: HTMLCanvasElement;
    };
};

/**
 * Apply CSS filters to the OpenSeadragon canvas element.
 * CSS filters are GPU-accelerated and work without modifying OSD internals.
 */
export function applyFilters(viewer: OSDViewer, filters: ImageFilters): void {
    // OSD uses either canvas or webgl drawer
    const canvas = viewer.drawer?.canvas as HTMLCanvasElement | undefined;
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
