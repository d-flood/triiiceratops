/** IIFE entry: registers the plugin factory, activates nothing. */

import { ImageManipulationPlugin } from './plugin';
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';

registerBrowserPlugin(ImageManipulationPlugin);
