// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function greeting(context: PluginContext) {
    const text = context.locale.t('example_title');
    const stop = context.locale.subscribe((locale) => {
        console.log('active locale is now', locale);
    });
    return { text, stop };
}
