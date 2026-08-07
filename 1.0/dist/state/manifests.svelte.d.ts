import type { RequestConfig } from '../types/config';
/**
 * One manifest's entry in the cache: the **raw JSON as fetched**, the fetch
 * error if there was one, and whether a fetch is in flight. Nothing here is
 * parsed or wrapped — the cache holds the document, and the first-party
 * enumerators in `utils/iiifParsing` read it.
 */
export interface ManifestEntry {
    json?: any;
    error?: any;
    isFetching?: boolean;
}
export declare class ManifestsState {
    manifests: Record<string, ManifestEntry>;
    private pendingFetches;
    /**
     * Store a manifest's raw JSON under its id.
     *
     * **A pure store.** It does not parse, validate, or walk the document, and
     * therefore cannot throw. That is a behavior requirement, not an aesthetic
     * one: this is reached from the public `setManifestData`, which has no
     * `try`/`catch`, so a throw here would skip the manifest-id assignment, the
     * ready marking, and the change event — leaving the viewer half-initialized
     * (SPEC → "Failure contract"). Reading the document is every enumerator's
     * job, and each of them is total.
     *
     * `async` is vestigial — the parse it awaited is gone — but the
     * `Promise<void>` signature is public and is kept deliberately.
     */
    registerManifest(manifestId: string, json: any): Promise<void>;
    /**
     * Fetch a IIIF resource by URL and return the raw JSON.
     * Does not register it as a manifest. Used for collection detection.
     */
    fetchResource(url: string, requestConfig?: RequestConfig): Promise<any>;
    fetchManifest(manifestId: string, requestConfig?: RequestConfig): Promise<void>;
    clearManifest(manifestId: string): void;
    getManifestEntry(manifestId: string): ManifestEntry | undefined;
    fetchAnnotationList(url: string): Promise<void>;
    private getStructureSequences;
    private findCanvasInJson;
    private getCanvasJson;
    private getCanvasAnnotationListRefs;
    private matchesAnnotationSource;
    ensureCanvasAnnotations(manifestId: string, canvasId: string, sourceId?: string): Promise<any[]>;
    /**
     * How many sequences the active manifest offers, as the sequence picker
     * counts them. Ranges with `behavior: "sequence"` define the sequences when
     * the manifest has any; the manifest's own sequences are the fallback.
     */
    getSequenceCount(manifestId: string): number;
    /**
     * The canvases of one sequence, as **raw IIIF Canvas JSON** — v2 or v3 as
     * the manifest authored it, never a library object. Read them with core's
     * version-neutral helpers rather than by branching on IIIF version.
     *
     * Structure-derived sequences take priority, as above. `sequenceIndex` is
     * clamped into range in either case.
     */
    getCanvases(manifestId: string, sequenceIndex?: number): any[];
    getAnnotations(manifestId: string, canvasId: string, sourceId?: string): any[];
    manualGetAnnotations(manifestId: string, canvasId: string, sourceId?: string): any[];
}
export declare const manifestsState: ManifestsState;
