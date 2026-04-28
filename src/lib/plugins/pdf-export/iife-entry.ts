import { registerIifePlugin } from '../../types/plugin';
import { createPdfExportPlugin, PdfExportPlugin } from './index';

registerIifePlugin(
    'PdfExport',
    Object.assign(PdfExportPlugin, { createPdfExportPlugin }),
);
