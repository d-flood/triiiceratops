/**
 * The set of languages a IIIF document actually offers, for the chrome's
 * language picker.
 *
 * Only the descriptive properties and range labels are walked. Annotation
 * bodies can carry languages of their own, but annotation pages load lazily and
 * the toolbar has to decide whether to render a control before they arrive.
 */

/**
 * BCP 47 tags carried by one language-mapped value, added to `into`.
 *
 * `none` is excluded: IIIF spells "no language specified" that way, so it names
 * no language a user could pick. A plain string or a `@value` with no
 * `@language` contributes nothing for the same reason.
 */
function collectLanguageTags(value: unknown, into: Set<string>): void {
    if (!value || typeof value !== 'object') return;

    if (Array.isArray(value)) {
        for (const entry of value) {
            if (entry && typeof entry === 'object') {
                const tag = (entry as Record<string, unknown>)['@language'];
                if (typeof tag === 'string' && tag !== 'none') into.add(tag);
            }
        }
        return;
    }

    const map = value as Record<string, unknown>;

    // v2 JSON-LD value object, not a language map: its one tag is `@language`.
    if ('@value' in map) {
        const tag = map['@language'];
        if (typeof tag === 'string' && tag !== 'none') into.add(tag);
        return;
    }

    for (const key of Object.keys(map)) {
        if (key !== 'none') into.add(key);
    }
}

/** Range labels, to any depth. */
function collectStructureLocales(nodes: unknown, into: Set<string>): void {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const record = node as Record<string, unknown>;
        collectLanguageTags(record.label, into);
        collectStructureLocales(record.items ?? record.members, into);
    }
}

/**
 * Every language the manifest's descriptive properties are authored in, sorted
 * for a stable menu order.
 *
 * Coverage is deliberately a union rather than an intersection: a manifest may
 * label itself in English and French while its metadata is English only, and
 * offering French there is still right — the resolver falls back per value.
 */
export function collectManifestLocales(manifestJson: unknown): string[] {
    if (!manifestJson || typeof manifestJson !== 'object') return [];

    const record = manifestJson as Record<string, unknown>;
    const locales = new Set<string>();

    // v3 spellings, then the v2 ones that carry language maps of their own.
    for (const key of [
        'label',
        'summary',
        'description',
        'attribution',
    ] as const) {
        collectLanguageTags(record[key], locales);
    }

    const requiredStatement = record.requiredStatement;
    if (requiredStatement && typeof requiredStatement === 'object') {
        const statement = requiredStatement as Record<string, unknown>;
        collectLanguageTags(statement.label, locales);
        collectLanguageTags(statement.value, locales);
    }

    if (Array.isArray(record.metadata)) {
        for (const entry of record.metadata) {
            if (!entry || typeof entry !== 'object') continue;
            const pair = entry as Record<string, unknown>;
            collectLanguageTags(pair.label, locales);
            collectLanguageTags(pair.value, locales);
        }
    }

    collectStructureLocales(record.structures, locales);

    return [...locales].sort();
}
