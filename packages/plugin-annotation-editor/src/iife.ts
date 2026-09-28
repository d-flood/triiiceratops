/** IIFE entry: registers the plugin factory, activates nothing. */

import { AnnotationEditorPlugin } from './plugin';
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';

registerBrowserPlugin(AnnotationEditorPlugin);
