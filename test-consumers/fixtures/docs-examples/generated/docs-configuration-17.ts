// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { LocaleCatalog, TriiiceratopsViewerElement } from 'triiiceratops';
// The German catalog is published as an asset, not bundled into the viewer:
// import it only in a host that actually offers German.
import de from 'triiiceratops/locales/de.json';

// A full catalog and a partial one: `fr` translates the two strings it names
// and leaves every other string in English. An empty object declares a locale
// `loadMessages` can supply — the picker offers it, and the chrome renders
// English until the catalog lands.
const messages: LocaleCatalog = {
    de,
    fr: { search: 'Rechercher', close: 'Fermer' },
    ja: {},
};

async function loadMessages(locale: string) {
    const response = await fetch(`/locales/${locale}.json`);
    return response.ok
        ? ((await response.json()) as Record<string, string>)
        : undefined;
}

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;
Object.assign(el, { messages, loadMessages });
// A framework wrapper passes both fields on `config` instead.
(el as { config?: unknown }).config = { locale: 'de' };
