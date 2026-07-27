// Strict-TS packed consumer (ticket 21). Proves that core's PUBLIC declarations
// referencing `OpenSeadragon.*` resolve for a consumer under `skipLibCheck:false`
// with `types: []` — i.e. WITHOUT the consumer manually installing
// `@types/openseadragon`. Compilation of this file IS the assertion; the harness
// runs `tsc` (buildScript `check`) and a non-zero exit fails the fixture.
//
// `skipLibCheck: false` type-checks core's WHOLE reachable declaration graph,
// so both public OSD surfaces are exercised: `ViewerState.osdViewer`
// (`OpenSeadragon.Viewer`, referenced directly below) and
// `ViewerConfig.openSeadragonConfig` (`Partial<OpenSeadragon.Options>`, reached
// transitively through the viewer component's `config` prop declaration). An
// unresolved `OpenSeadragon` namespace anywhere in that graph fails the compile.

import { ViewerState } from 'triiiceratops';

const state = new ViewerState();

// The documented OSD pass-through (ADR 0009). Its type is `OpenSeadragon.Viewer`
// in core's `.d.ts`; a strict consumer must be able to name that type without
// installing OSD types by hand.
const osd = state.osdViewer;

// Use the resolved OSD type structurally, so the reference is load-bearing and a
// broken `OpenSeadragon` resolution would fail the compile rather than be elided.
export function isOsdReady(): boolean {
    return osd !== null;
}

export function readOsd(): typeof osd {
    return state.osdViewer;
}
