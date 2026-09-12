/**
 * Registers the renderer's e2e instrumentation.
 *
 * Loaded by the dev entry and by the e2e fixture pages that boot the custom
 * element directly rather than through the demo app. Outside `src/lib`, so no
 * build that ships the viewer reaches it.
 */
import { setRendererDevtools } from '../lib/renderer/rendererDevtools';

import { installCanvasRendererHandle } from './canvasRendererHandle';

setRendererDevtools(installCanvasRendererHandle);
