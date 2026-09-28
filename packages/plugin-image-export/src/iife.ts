/** IIFE entry: registers the plugin factory, activates nothing. */

import { ImageDownloadPlugin } from './plugin';
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';

registerBrowserPlugin(ImageDownloadPlugin);
