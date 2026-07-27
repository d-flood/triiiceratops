import { definePluginStyles } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned GLOBAL CSS + its style-service install id, shaped
 * by {@link definePluginStyles} into the `STYLES` / `STYLE_ID` exports the
 * activation installs.
 *
 * Almost all of the Flyout's look is idiomatic, Svelte-scoped CSS that now lives
 * in `Flyout.svelte`'s `<style>` block (extracted at build time by `bundledCss()`
 * and installed CSP-safe under the `bundled` id — see plugin.ts / vite.config.ts),
 * together with the shared `@triiiceratops/ui` Range/Tooltip primitives it renders.
 *
 * What remains here is the small set of rules that are GENUINELY global: the
 * downward-flyout flip, keyed off the ancestor `[data-flyout-panel]` element that
 * core (not this component) owns and stamps with the growth-direction class. A
 * Svelte-scoped rule can't reach an ancestor outside the component, so these stay
 * as an installed global sheet. They match the component's plain (un-hashed) class
 * names, which the scoped elements still carry, so they compose correctly.
 *
 * Placement: the default (upward flyout, viewer's inline bottom bar) stacks the
 * sliders ABOVE the base; a downward flyout (top toolbar) flips both the cluster
 * and the base so the sliders still hang toward the canvas.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(
    `
/* Downward flyout (top toolbar): sliders hang below the glass base. Keyed off
   the core-owned ancestor [data-flyout-panel], so these are global (not
   Svelte-scoped) rules. */
[data-flyout-panel].down .tri-im-cluster {
    flex-direction: column-reverse;
}
[data-flyout-panel].down .tri-im-base {
    flex-direction: column-reverse;
}
`,
    'flyout',
);
