// Strict-TS consumer: compilation IS the assertion. No third-party type crosses this boundary.

import type { ViewportBox, ViewportPoint } from 'triiiceratops';
import { ViewerState } from 'triiiceratops/svelte';

const state = new ViewerState();

// Query-only viewport state in canvas and screen space; no renderer type crosses.
export function view(): {
    scale: number;
    centre: ViewportPoint | null;
    bounds: ViewportBox | null;
    container: { width: number; height: number };
} {
    return {
        scale: state.viewportScale,
        centre: state.viewportCentre,
        bounds: state.viewportBounds,
        container: state.containerSize,
    };
}

// Viewport commands and plugin-boundary coordinate helpers.
export function frame(bounds: ViewportBox): ViewportPoint | null {
    state.fitBounds(bounds);
    state.zoomTo(2);
    state.panTo({ x: bounds.x, y: bounds.y });
    return state.canvasToScreen({ x: bounds.x, y: bounds.y });
}

export function dim(): number {
    state.setImageAdjustments({ brightness: 80 });
    return state.imageAdjustments.brightness;
}

export function configure(): void {
    state.config = { renderer: { zoomPerClick: 1.5, minPixelRatio: 0.5 } };
}
