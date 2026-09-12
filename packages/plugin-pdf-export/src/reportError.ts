import { createCommandErrorReporter } from '@triiiceratops/plugin-sdk';

import { PLUGIN_META } from './identity';

export const reportPdfExportError = createCommandErrorReporter(PLUGIN_META);
