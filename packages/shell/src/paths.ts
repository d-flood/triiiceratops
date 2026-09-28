import { fileURLToPath } from 'node:url';

export const TOKENS_CSS = fileURLToPath(
    new URL('../tokens.css', import.meta.url),
);

export const CONTROLS_CSS = fileURLToPath(
    new URL('../controls.css', import.meta.url),
);
