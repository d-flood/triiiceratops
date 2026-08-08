/**
 * `@triiiceratops/plugin-sdk/testing` — the plugin-author test kit (ticket 14).
 *
 * A plugin author validates a plugin without a full application by mounting it
 * against a **test viewer context**: a REAL, compiled `ViewerState` (real
 * commands, real batched notifications) with recording-double services and a
 * mountable headless renderer stand-in (CONTEXT.md **Test viewer context** —
 * "the harness is fake; the state is never fake"). Because the state is the production
 * implementation, a passing test reflects production semantics.
 *
 * ── Flush timing rule (READ THIS) ─────────────────────────────────────────
 * Notifications are BATCHED and delivered on the reactive flush, never
 * synchronously inside a command. After a command (or `setLocale`/`attachRenderer`),
 * `await flush()` before asserting a subscriber reacted:
 *
 *   import { createTestViewerContext, flush } from '@triiiceratops/plugin-sdk/testing';
 *   const { context } = createTestViewerContext();
 *   const open = context.selectors.select((s) => s.toolbarOpen);
 *   let seen = open.get();
 *   open.subscribe((v) => { seen = v; });
 *   context.viewerState.toggleToolbar();
 *   await flush();            // ← notification lands here
 *   expect(seen).toBe(true);
 *
 * This kit is unit-level. Renderer- and Annotorious-dependent behavior is
 * validated at the browser seam, not here: the kit ships no Annotorious fake.
 */

// The flush helper and headless state factory come from core's COMPILED testing
// entry (Svelte compiled away, its runtime bundled in), so this kit runs in a
// plain vitest/jsdom project with no Svelte tooling.
export {
    flush,
    createHeadlessViewerState,
    type HeadlessViewerFixtures,
} from 'triiiceratops/testing';

// The test viewer context, recording doubles, and the renderer-readiness helper.
export {
    createTestViewerContext,
    whenRendererReady,
    type TestViewerContext,
    type TestViewerContextOptions,
    type RecordingStyleService,
    type RecordedStyleInstall,
    type RecordingUiService,
    type RecordedUiRequest,
    type TestLocaleService,
} from './context.js';

// The conformance suite.
export {
    runPluginConformance,
    conformanceCases,
    type PluginFactory,
    type ConformanceCase,
} from './conformance.js';
