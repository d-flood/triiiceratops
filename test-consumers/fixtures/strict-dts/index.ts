// Strict-TS packed consumer. Proves core's PUBLIC declarations type-check for a
// consumer under `skipLibCheck: false` with `types: []` — i.e. that nothing in
// core's reachable declaration graph depends on ambient globals or on a type
// package the consumer has to install by hand. Compilation of this file IS the
// assertion; the harness runs `tsc` (buildScript `check`) and a non-zero exit
// fails the fixture.
//
// It was `strict-osd-types`, and it existed because the renderer pass-through
// put a third-party viewer type and its options object in core's public
// `.d.ts`, which a strict consumer could not resolve without installing that
// library's `@types` package by hand. That is the whole problem the first-party
// viewport API removed: no third-party type crosses this boundary at all now.
// The fixture survives because `skipLibCheck: false` over the WHOLE graph still
// catches a type leak — the check outlived the leak it was written for.
//
// Imports from `triiiceratops/svelte`, not `triiiceratops`: this fixture needs a
// CONSTRUCTIBLE `ViewerState` (it calls `new`) and it needs the viewer
// component's declaration in the graph, so the `config` prop's whole type is
// checked too. Both live on the `./svelte` entry since `.` became
// framework-neutral, and this fixture installs `svelte`.

import type { ViewportBox, ViewportPoint } from 'triiiceratops';
import { ViewerState } from 'triiiceratops/svelte';

const state = new ViewerState();

// The query-only viewport state. Every one of these is first-party: plain
// numbers and plain data, in canvas space and screen space, with no renderer
// type anywhere in the declarations.
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

// The viewport commands, and the coordinate helpers at the plugin boundary.
export function frame(bounds: ViewportBox): ViewportPoint | null {
    state.fitBounds(bounds);
    state.zoomTo(2);
    state.panTo({ x: bounds.x, y: bounds.y });
    return state.canvasToScreen({ x: bounds.x, y: bounds.y });
}

// The image-adjustment command, which hands out no DOM node.
export function dim(): number {
    state.setImageAdjustments({ brightness: 80 });
    return state.imageAdjustments.brightness;
}

// The closed renderer config. An open partial-options escape hatch is exactly
// what this fixture used to have to resolve types for; there is none now.
export function configure(): void {
    state.config = { renderer: { zoomPerClick: 1.5, minPixelRatio: 0.5 } };
}
