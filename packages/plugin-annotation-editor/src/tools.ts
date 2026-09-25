import type { DrawingTool } from './types';

/** Every tool the plugin knows how to draw, in default button order. */
export const ALL_TOOLS: DrawingTool[] = [
    'rectangle',
    'ellipse',
    'polygon',
    'point',
    'wholeCanvas',
];

/**
 * Resolve the effective tool set and default tool from config so the panel and
 * the drawing layer share one source of truth. An empty/absent `tools` list
 * means "all tools"; `defaultTool` is honored only when it's within `tools`,
 * otherwise the first available tool wins.
 */
export function resolveTools(config: {
    tools?: DrawingTool[];
    defaultTool?: DrawingTool;
}): { tools: DrawingTool[]; defaultTool: DrawingTool } {
    const tools = config.tools?.length ? config.tools : ALL_TOOLS;
    const defaultTool =
        config.defaultTool && tools.includes(config.defaultTool)
            ? config.defaultTool
            : tools[0];
    return { tools, defaultTool };
}
