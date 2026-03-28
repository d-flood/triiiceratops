import * as manifesto from 'manifesto.js/dist-esmodule/index.js';

export type ManifestoModule = typeof import('manifesto.js/dist-esmodule/index.js');

export const manifestoModule: ManifestoModule = manifesto;
