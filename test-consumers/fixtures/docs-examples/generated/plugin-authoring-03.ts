// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { svgIcon, SvgIconError } from '@triiiceratops/plugin-sdk';

try {
    const icon = svgIcon('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>');
    void icon;
} catch (err) {
    if (err instanceof SvgIconError) {
        // A developer error — fix the SVG string.
    }
}
