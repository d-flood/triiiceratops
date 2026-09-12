import { createCommandErrorReporter } from '@triiiceratops/plugin-sdk';

import { PLUGIN_META } from './identity';

export const reportImageDownloadError = createCommandErrorReporter(PLUGIN_META);
