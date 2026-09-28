import type { DrawingTool } from './types';

export const ALL_TOOLS: DrawingTool[] = [
    'rectangle',
    'ellipse',
    'polygon',
    'point',
    'wholeCanvas',
];

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
