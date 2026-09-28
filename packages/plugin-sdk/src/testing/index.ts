/** Test kit: real `ViewerState`, recording doubles. Await `flush()` after commands. */

export {
    flush,
    createHeadlessViewerState,
    type HeadlessViewerFixtures,
} from 'triiiceratops/testing';

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

export {
    createStubStyleService,
    createStubLocaleService,
    createStubUiService,
    createStubSurfaceService,
} from './stubs.js';

export {
    runPluginConformance,
    conformanceCases,
    type PluginFactory,
    type ConformanceCase,
} from './conformance.js';
