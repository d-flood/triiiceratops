/** IIFE entry: registers the plugin factory, activates nothing. Core's script must come first. */

import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register-shared';

import { AvPlugin } from './plugin';

registerBrowserPlugin(AvPlugin);
