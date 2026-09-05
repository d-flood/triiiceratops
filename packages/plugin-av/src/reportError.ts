import { createCommandErrorReporter } from '@triiiceratops/plugin-sdk';

import { PLUGIN_META } from './identity';

/** Report a refused playback command on the host's structured error channel. */
export const reportAvCommandError = createCommandErrorReporter(PLUGIN_META);
