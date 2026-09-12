/**
 * The bookkeeping every plugin-facing registry in core does: accept a record
 * under a trimmed, unique, plugin-prefixed id, hand back an idempotent dispose,
 * and keep a frozen snapshot the render site can iterate.
 *
 * Three registries are built on this — overlay layers, transport chrome and
 * paint hooks — and they remain three separate objects with three separate
 * contracts (`docs/adr/0016-overlay-layers-are-dom-and-the-paint-hook-stays.md`).
 * Only the bookkeeping is shared: nothing here knows about DOM containers,
 * playback ports or canvas contexts, so a change to any of those cannot reach
 * across through this module.
 */

import { once } from './once.js';

/** A record the registry has accepted. Its id is the key for everything here. */
export interface OwnedRecord {
    id: string;
}

export interface OwnedRegistry<Input, Record extends OwnedRecord> {
    /**
     * Accept a registration. Returns an idempotent dispose; a refused
     * registration returns a no-op one, so a caller never has to branch.
     */
    register(input: Input): () => void;
    /**
     * Drop every record whose id carries the `` `${pluginId}:` `` prefix, by the
     * same path a returned dispose takes. The **backstop** for a plugin whose
     * own teardown misses its dispose, not the normal way to release something.
     */
    disposeOwnedBy(pluginId: string): void;
    /** Drop everything, whoever owns it. */
    disposeAll(): void;
    /** The accepted records, frozen and rebuilt on change. */
    readonly snapshot: readonly Record[];
}

export interface OwnedRegistryOptions<Input, Record extends OwnedRecord> {
    /**
     * The public command this registry backs (`registerOverlayLayer`), which
     * names the registry in every refusal so the message places the mistake.
     */
    name: string;
    /**
     * What a valid registration looks like, as the tail of "…needs …" — the one
     * sentence a refusal can give that the generic rules cannot.
     */
    shape: string;
    /** Whether everything but the id is well formed. The id is checked here. */
    validate(input: Input): boolean;
    /**
     * Build the record the snapshot carries from the accepted input, its trimmed
     * id and its registration sequence.
     */
    project(input: Input, id: string, sequence: number): Record;
    /** Snapshot order. Registration order when omitted. */
    sort?(records: Iterable<Record>): Record[];
    /** How the render site learns a record arrived or left. */
    onChange?: () => void;
    /** Told why a registration was refused, for the developer's console. */
    onRefused?: (message: string) => void;
    /**
     * Whether `pluginId` names a plugin of this viewer — how an id's prefix is
     * validated. Omitted, ids are not checked against any owner, which is both
     * what a registry with no ownership rule wants and what the unit tests,
     * having no viewer to ask, rely on.
     */
    isKnownPlugin?: (pluginId: string) => boolean;
}

export function createOwnedRegistry<Input, Record extends OwnedRecord>(
    options: OwnedRegistryOptions<Input, Record>,
): OwnedRegistry<Input, Record> {
    // A plain Set, deliberately not a `SvelteSet`: the reactive signal is the
    // `onChange` callback, which viewer state turns into exactly one state
    // write. A reactive collection here would additionally wake the batched
    // state watcher for every internal read a rebuild does.
    const held = new Set<Record>();
    let sequence = 0;
    let snapshot: readonly Record[] = [];

    function rebuild(): void {
        snapshot = Object.freeze(options.sort ? options.sort(held) : [...held]);
        options.onChange?.();
    }

    function disposeWhere(matches: (id: string) => boolean): void {
        let removed = false;
        for (const record of [...held]) {
            if (!matches(record.id)) continue;
            held.delete(record);
            removed = true;
        }
        if (removed) rebuild();
    }

    function refuse(message: string): () => void {
        options.onRefused?.(message);
        return () => {};
    }

    return {
        get snapshot() {
            return snapshot;
        },

        disposeOwnedBy(pluginId: string): void {
            // The trailing colon is load-bearing: without it, unregistering
            // `notes` would also evict `notes-extra`'s registrations.
            const prefix = `${pluginId}:`;
            disposeWhere((id) => id.startsWith(prefix));
        },

        disposeAll(): void {
            disposeWhere(() => true);
        },

        register(input: Input): () => void {
            const candidate = (input as { id?: unknown } | null | undefined)
                ?.id;
            const id = typeof candidate === 'string' ? candidate.trim() : '';
            if (!id || !options.validate(input)) {
                return refuse(`${options.name} needs ${options.shape}.`);
            }

            // The prefix is everything before the FIRST colon, so a `<name>`
            // containing one is the plugin's business. An id with no colon has
            // no prefix, which no plugin id matches, so it lands here too.
            const separator = id.indexOf(':');
            const owner = separator > 0 ? id.slice(0, separator) : '';
            if (options.isKnownPlugin && !options.isKnownPlugin(owner)) {
                // Loud at development time rather than a leak later: an id core
                // cannot attribute is an id core cannot release when its plugin
                // goes away.
                return refuse(
                    `${options.name} ignored the id "${id}": expected \`<pluginId>:<name>\` naming a plugin of this viewer.`,
                );
            }

            // Refused rather than allowed to shadow. The id names this
            // registration in every report, and for the registries whose render
            // site keys on it a second record under a taken name is a
            // duplicate-key error that would take the whole surface down.
            for (const existing of held) {
                if (existing.id === id) {
                    return refuse(
                        `${options.name} ignored a duplicate id "${id}".`,
                    );
                }
            }

            const record = options.project(input, id, sequence++);
            held.add(record);
            rebuild();

            // Keyed on the record still being held rather than on the `once`
            // token alone: a record already dropped by `disposeOwnedBy` must
            // make this a no-op too, so a plugin that both releases its
            // registration and is unregistered does not announce a second,
            // empty change.
            return once(() => {
                if (!held.delete(record)) return;
                rebuild();
            });
        },
    };
}
