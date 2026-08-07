/**
 * Utility for parsing IIIF Presentation 3.0 `structures` (Ranges)
 * into a flat tree suitable for rendering a table of contents.
 *
 * IIIF v3 structures are an array of Range objects at the manifest root.
 * Each Range has `items` which may be Canvases or nested Ranges.
 *
 * IIIF v2 structures use `structures` with `@type: "sc:Range"` and
 * `canvases` / `ranges` arrays.
 */
export interface StructureNode {
    /** Range id */
    id: string;
    /** Human-readable label */
    label: string;
    /** Normalized IIIF behaviors applied to this range */
    behaviors: string[];
    /** Depth in the tree (0 = top-level) */
    depth: number;
    /** Canvas IDs directly referenced by this range (not children) */
    canvasIds: string[];
    /** Nested child ranges */
    children: StructureNode[];
}
/**
 * Parse a manifest's `structures` into the TOC tree.
 *
 * Takes **raw IIIF Manifest JSON**, v2 or v3 as authored; both Range spellings
 * are handled below. Returns an array of top-level StructureNodes.
 */
export declare function parseStructures(manifest: any): StructureNode[];
/**
 * Given a canvas ID and a list of structure nodes, find the first
 * range node that directly contains the given canvas.
 */
export declare function findRangeForCanvas(canvasId: string, nodes: StructureNode[]): StructureNode | null;
/**
 * Whether a structure node directly contains the given canvas.
 */
export declare function isStructureNodeActive(node: StructureNode, canvasId: string | null): boolean;
/**
 * Get the top-level sequence node index for a structure node id.
 */
export declare function getSequenceNodeIndexById(nodes: StructureNode[], nodeId: string): number | undefined;
