/**
 * The share URL's three kinds of state: the IIIF-meaningful view carried in
 * `iiif-content`, viewer configuration carried in `config`, and sparse per-tab
 * persistence — all read from the URL and `sessionStorage`.
 *
 * Shared by every surface that reads or writes a share URL, so that they cannot
 * drift on what "only the keys the reader set" means.
 */

import { parseContentState, type CanvasRegion } from 'triiiceratops';

export const CONFIG_STORAGE_KEY = 'triiiceratops-demo:config';

/** Presence forces clean defaults without clearing what is stored. */
export const CLEAN_CONFIG_PARAM = 'clean-config';

/**
 * A nested *partial* of the viewer configuration: only the keys a user set. It
 * is never materialized, because an untouched key must stay `undefined` so the
 * manifest's own answer wins.
 */
export type SparseConfig = Record<string, unknown>;

export type ViewTarget = {
    manifestId: string;
    canvasId?: string;
    region?: CanvasRegion;
};

function isPlainObject(value: unknown): value is SparseConfig {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A deep copy of plain JSON-shaped data. `structuredClone` cannot be used: the
 * configuration reaching these functions is a Svelte state proxy, and cloning a
 * Proxy throws.
 */
export function clonePlain<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => clonePlain(item)) as unknown as T;
    }
    if (isPlainObject(value)) {
        const copy: SparseConfig = {};
        for (const [key, item] of Object.entries(value)) {
            copy[key] = clonePlain(item);
        }
        return copy as unknown as T;
    }
    return value;
}

function toParams(search: string | URLSearchParams): URLSearchParams {
    return typeof search === 'string' ? new URLSearchParams(search) : search;
}

// ==================== sparse algebra ====================

/** Deep merge: plain objects merge, every other value replaces. */
export function mergeSparse(
    base: SparseConfig,
    overlay: SparseConfig,
): SparseConfig {
    const merged: SparseConfig = { ...base };

    for (const [key, value] of Object.entries(overlay)) {
        const existing = merged[key];
        merged[key] =
            isPlainObject(existing) && isPlainObject(value)
                ? mergeSparse(existing, value)
                : value;
    }

    return merged;
}

function sameLeaf(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return (
            a.length === b.length && a.every((item, i) => sameLeaf(item, b[i]))
        );
    }
    return false;
}

/**
 * The leaf paths whose values in `next` differ from `baseline`, as a sparse
 * object. Keys present in `baseline` but absent from `next` are not reported: a
 * removal has no leaf value to record, so it is silently dropped from the
 * overlay.
 */
export function diffSparse(
    next: SparseConfig,
    baseline: SparseConfig,
): SparseConfig {
    const delta: SparseConfig = {};

    for (const [key, value] of Object.entries(next)) {
        const before = baseline[key];

        if (isPlainObject(value)) {
            if (isPlainObject(before)) {
                const sub = diffSparse(value, before);
                if (Object.keys(sub).length) delta[key] = sub;
            } else {
                delta[key] = clonePlain(value);
            }
            continue;
        }

        if (!sameLeaf(value, before)) delta[key] = value;
    }

    return delta;
}

/** Every leaf path in a sparse object. An empty object counts as a leaf. */
export function collectPaths(sparse: SparseConfig): string[][] {
    const paths: string[][] = [];

    for (const [key, value] of Object.entries(sparse)) {
        if (isPlainObject(value) && Object.keys(value).length) {
            for (const rest of collectPaths(value)) {
                paths.push([key, ...rest]);
            }
        } else {
            paths.push([key]);
        }
    }

    return paths;
}

export function getAtPath(source: SparseConfig, path: string[]): unknown {
    let cursor: unknown = source;
    for (const key of path) {
        if (!isPlainObject(cursor)) return undefined;
        cursor = cursor[key];
    }
    return cursor;
}

export function setAtPath(
    target: SparseConfig,
    path: string[],
    value: unknown,
): void {
    let cursor = target;
    for (const key of path.slice(0, -1)) {
        const next = cursor[key];
        if (!isPlainObject(next)) {
            cursor[key] = {};
        }
        cursor = cursor[key] as SparseConfig;
    }
    cursor[path[path.length - 1]] = value;
}

// ==================== sparse tracking ====================

/**
 * The bookkeeping that keeps persistence sparse.
 *
 * `baseline` is the configuration nobody chose: the defaults, plus every value
 * the viewer has since reported for itself. Whatever the live configuration says
 * that the baseline does not is user intent, and the `userSet` overlay
 * accumulates exactly those path→value pairs — the values the *user* picked,
 * which is what gets persisted and shared.
 *
 * Because a value the viewer reports is folded into the baseline, a toggle the
 * user makes inside the viewer's own chrome is indistinguishable from a value
 * the viewer decided for itself, so it is not persisted. The settings pane is
 * the surface that records intent.
 */
export function createSparseTracker<T extends object>(
    defaults: T,
    initialSparse: SparseConfig = {},
) {
    let baseline = clonePlain(defaults) as SparseConfig;
    let userSet = clonePlain(initialSparse);

    return {
        get userSet(): SparseConfig {
            return userSet;
        },

        /**
         * A value the viewer reported. Writing `config` only on an actual change
         * is what keeps the viewer→config sync effect from re-triggering itself.
         * A path the user already set keeps its overlay value: the viewer
         * reporting its own answer is not the user changing their mind.
         */
        applyViewerValue(
            config: SparseConfig,
            path: string[],
            value: unknown,
        ): void {
            setAtPath(baseline, path, value);
            if (getAtPath(config, path) !== value) {
                setAtPath(config, path, value);
            }
        },

        /**
         * Folds everything the configuration says that the baseline does not
         * into both the baseline and the overlay, and returns the overlay.
         */
        record(config: SparseConfig): SparseConfig {
            for (const path of collectPaths(diffSparse(config, baseline))) {
                const value = getAtPath(config, path);
                setAtPath(baseline, path, value);
                setAtPath(userSet, path, value);
            }

            return userSet;
        },

        reset(): void {
            baseline = clonePlain(defaults) as SparseConfig;
            userSet = {};
        },
    };
}

// ==================== per-tab persistence ====================

/*
 * Every `sessionStorage` access is guarded: Safari's private mode throws on
 * access rather than degrading to a no-op store.
 */

export function readStoredConfig(): SparseConfig {
    try {
        const raw = sessionStorage.getItem(CONFIG_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function writeStoredConfig(sparse: SparseConfig): void {
    try {
        if (!Object.keys(sparse).length) {
            sessionStorage.removeItem(CONFIG_STORAGE_KEY);
            return;
        }
        sessionStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(sparse));
    } catch {
        // Persistence is a development convenience; losing it is not an error.
    }
}

export function clearStoredConfig(): void {
    try {
        sessionStorage.removeItem(CONFIG_STORAGE_KEY);
    } catch {
        // See writeStoredConfig.
    }
}

// ==================== content state ====================

function base64url(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * A content state identifies resources by absolute URI, but the playground's own
 * sample manifests are shipped at root-relative paths. A bare relative id fails
 * `parseContentState`'s URI test and yields a dead link.
 */
function absolutize(id: string, base: string): string {
    try {
        return new URL(id, base).href;
    } catch {
        return id;
    }
}

/**
 * The emitting half of `parseContentState`. A manifest on its own is a legal
 * content state as a bare URI, and that is what it becomes: wrapping it in an
 * Annotation whose `target` is the manifest id would have the parser hand the
 * manifest id back as a canvas id. A known canvas becomes a base64url-encoded
 * W3C Annotation naming its manifest in `partOf`.
 */
export function serializeContentState(
    target: ViewTarget,
    base: string = window.location.href,
): string | null {
    if (!target.manifestId) return null;

    const manifestId = absolutize(target.manifestId, base);
    if (!target.canvasId) return manifestId;

    // `parseIiifXywh` matches the first `xywh=`, so any fragment already on the
    // canvas id would win over the region being shared.
    const canvasId = absolutize(target.canvasId, base).split('#')[0];

    const { region } = target;
    const fragment = region
        ? `#xywh=${region.x},${region.y},${region.width},${region.height}`
        : '';

    return base64url(
        JSON.stringify({
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            type: 'Annotation',
            motivation: 'contentState',
            target: {
                id: `${canvasId}${fragment}`,
                type: 'Canvas',
                partOf: [{ id: manifestId, type: 'Manifest' }],
            },
        }),
    );
}

// ==================== URL resolution ====================

function parseSharedConfig(param: string | null): SparseConfig {
    if (!param) return {};
    try {
        const parsed = JSON.parse(param);
        return isPlainObject(parsed) ? parsed : {};
    } catch (e) {
        console.error('Failed to parse config from URL', e);
        return {};
    }
}

/**
 * The share URL. The view travels as a content state, configuration travels as
 * its own parameter, and configuration never enters the content state.
 */
export function buildShareUrl({
    pathname,
    mode,
    target,
    config,
}: {
    pathname: string;
    mode: string;
    target: ViewTarget;
    config: SparseConfig;
}): string {
    const params = new URLSearchParams();
    params.set('mode', mode);

    const contentState = serializeContentState(target);
    if (contentState) params.set('iiif-content', contentState);

    if (Object.keys(config).length) {
        params.set('config', JSON.stringify(config));
    }

    return `${pathname}?${params.toString()}`;
}

/**
 * The configuration handed to the viewer, the sparse overlay that produced it,
 * and whether this load is a clean one. A URL `config` beats stored
 * configuration; `clean-config` starts from an empty overlay and leaves storage
 * untouched, and a clean load must also not write to it.
 */
export function resolveInitialConfig<T extends object>({
    search,
    defaults,
}: {
    search: string | URLSearchParams;
    defaults: T;
}): { config: T; sparse: SparseConfig; clean: boolean } {
    const params = toParams(search);
    const clean = params.has(CLEAN_CONFIG_PARAM);

    if (clean) {
        return { config: clonePlain(defaults), sparse: {}, clean };
    }

    // An empty `config=` carries no overlay; treating it as present would make
    // it a second clean-defaults switch.
    const shared = params.get('config') || null;
    const sparse =
        shared !== null ? parseSharedConfig(shared) : readStoredConfig();

    return {
        config: mergeSparse(clonePlain(defaults) as SparseConfig, sparse) as T,
        sparse,
        clean,
    };
}

/**
 * The view to open. The legacy `manifest` and `canvas` parameters win; a
 * content state is consulted only when no `manifest` is given.
 */
export function resolveInitialView(search: string | URLSearchParams): {
    manifestUrl: string;
    canvasId: string;
    region: CanvasRegion | null;
} {
    const params = toParams(search);

    let manifestUrl = params.get('manifest') || '';
    let canvasId = params.get('canvas') || '';
    let region: CanvasRegion | null = null;

    const contentState = params.get('iiif-content');
    if (contentState && !manifestUrl) {
        const parsed = parseContentState(contentState);
        if (parsed?.manifestId) {
            manifestUrl = parsed.manifestId;
            if (parsed.canvasId) canvasId = parsed.canvasId;
            if (parsed.region) region = parsed.region;
        }
    }

    return { manifestUrl, canvasId, region };
}
