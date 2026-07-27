/**
 * Plugin conformance suite (ticket 14 test kit).
 *
 * `runPluginConformance` mounts the plugin against a REAL test viewer context
 * (real `ViewerState`, real batched notifications) with recording-double
 * services, and asserts the lifecycle contracts every plugin must honor:
 * mount/cleanup symmetry, subscription disposal, locale-change handling, style
 * cleanup, and error isolation. A passing run reflects production semantics.
 *
 * The panel (and its Annotorious-backed manager) stays closed by default, so this
 * unit-level run needs no OSD; OSD/Annotorious-dependent editing behavior is
 * validated at the browser (packed-fixture) seam.
 */

import { runPluginConformance } from '@triiiceratops/plugin-sdk/testing';

import { createAnnotationEditorPlugin } from './plugin';

runPluginConformance(() => createAnnotationEditorPlugin());
