/** IIFE entry: registers the plugin factory, activates nothing. */

import { PdfExportPlugin } from './plugin';
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';

registerBrowserPlugin(PdfExportPlugin);
