import * as manifesto from 'manifesto.js';

export type ManifestoModule = typeof import('manifesto.js');

export const manifestoModule: ManifestoModule = manifesto;
