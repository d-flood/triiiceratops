/**
 * The share URL's three kinds of state, shared by every surface that reads or
 * writes one so they cannot drift.
 */

import { parseContentState, type CanvasRegion } from 'triiiceratops';

const IIIF_CONTENT_PARAM = 'iiif-content';

export const CONFIG_STORAGE_KEY = 'triiiceratops-demo:config';

/** Presence forces clean defaults without clearing what is stored. */
export const CLEAN_CONFIG_PARAM = 'clean-config';

/** A nested *partial* of the viewer configuration: an untouched key stays `undefined` so the manifest's own answer wins. */
export type SparseConfig = Record<string, unknown>;

export type ViewTarget = {
    manifestId: string;
    canvasId?: string;
    region?: CanvasRegion;
};

function isPlainObject(value: unknown): value is SparseConfig {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Deep copy of JSON-shaped data. `structuredClone` throws on a Svelte state proxy. */
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
 * Leaf paths in `next` differing from `baseline`. Removals are not reported.
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

/** The overlay with every retraction taken out of it, so shared snippets state only what was decided. */
export function pruneSparse(sparse: SparseConfig): SparseConfig {
    const pruned: SparseConfig = {};

    for (const [key, value] of Object.entries(sparse)) {
        if (value === undefined) continue;

        if (isPlainObject(value)) {
            const sub = pruneSparse(value);
            if (Object.keys(sub).length) pruned[key] = sub;
            continue;
        }

        pruned[key] = clonePlain(value);
    }

    return pruned;
}

/** Every leaf path in a sparse object; an empty object counts as a leaf. */
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
 * Keeps persistence sparse. `baseline` is what nobody chose; `userSet` accumulates
 * only what the live configuration says that the baseline does not. A viewer-reported
 * value folds into the baseline, so chrome toggles are not persisted.
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
         * A value the viewer reported. Writes `config` only on an actual change to
         * avoid re-triggering the viewer→config sync; a user-set path keeps its value.
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

/* Every `sessionStorage` access is guarded: Safari private mode throws on access. */

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

/** Sample manifests ship at root-relative paths, which fail `parseContentState`'s URI test. */
function absolutize(id: string, base: string): string {
    try {
        return new URL(id, base).href;
    } catch {
        return id;
    }
}

/**
 * The emitting half of `parseContentState`. A manifest alone becomes a bare URI:
 * wrapping it would return the manifest id as a canvas id.
 */
export function serializeContentState(
    target: ViewTarget,
    base: string = window.location.href,
): string | null {
    if (!target.manifestId) return null;

    const manifestId = absolutize(target.manifestId, base);
    if (!target.canvasId) return manifestId;

    // `parseIiifXywh` matches the first `xywh=`.
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

/** The share URL. Configuration travels in its own parameter, never in the content state. */
export function buildShareUrl({
    pathname,
    target,
    config,
}: {
    pathname: string;
    target: ViewTarget;
    config: SparseConfig;
}): string {
    const params = new URLSearchParams();

    const contentState = serializeContentState(target);
    if (contentState) params.set(IIIF_CONTENT_PARAM, contentState);

    if (Object.keys(config).length) {
        params.set('config', JSON.stringify(config));
    }

    return `${pathname}?${params.toString()}`;
}

/**
 * The configuration for the viewer plus the sparse overlay that produced it. URL
 * `config` beats stored configuration; `clean-config` leaves storage untouched.
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

    // An empty `config=` carries no overlay.
    const shared = params.get('config') || null;
    const sparse =
        shared !== null ? parseSharedConfig(shared) : readStoredConfig();

    return {
        config: mergeSparse(clonePlain(defaults) as SparseConfig, sparse) as T,
        sparse,
        clean,
    };
}

/** The view to open. Legacy `manifest` wins; content state applies only without it. */
export function resolveInitialView(search: string | URLSearchParams): {
    manifestUrl: string;
    canvasId: string;
    region: CanvasRegion | null;
} {
    const params = toParams(search);

    let manifestUrl = params.get('manifest') || '';
    let canvasId = params.get('canvas') || '';
    let region: CanvasRegion | null = null;

    const contentState = params.get(IIIF_CONTENT_PARAM);
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

// ==================== dropped content state ====================

/** The read side of a `DataTransfer`. */
export type DropPayloadSource = Pick<DataTransfer, 'types' | 'getData'>;

/** The drag-and-drop flavour from cookbook recipe 0599 and Content State API §3.4. Not `text/uri-list`: a dragged `<img>` offers its own `src` there. */
const DROP_TYPE = 'text/plain';

/** Read from `types` alone: during `dragover` the payload itself is unreadable. */
export function carriesContentState(
    transfer: DropPayloadSource | null | undefined,
): boolean {
    return transfer?.types.includes(DROP_TYPE) ?? false;
}

/** The content state a drop carries, ready for `parseContentState`, or `null`. Both an Annotation and a bare Manifest URI pass through untouched. */
export function readDroppedContentState(
    transfer: DropPayloadSource | null | undefined,
): string | null {
    if (!carriesContentState(transfer)) return null;

    const payload = (transfer?.getData(DROP_TYPE) ?? '').trim();
    return payload || null;
}
