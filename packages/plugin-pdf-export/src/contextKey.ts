import type { PluginContext } from '@triiiceratops/plugin-sdk';

import type { PdfExportConfig } from './types';

export const PLUGIN_CONTEXT_KEY = Symbol('triiiceratops:plugin-pdf-export');

export interface PanelContext {
    readonly context: PluginContext;
    readonly config: PdfExportConfig;
}
