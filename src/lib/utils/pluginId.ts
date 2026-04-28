export function createPluginId(seed?: string): string {
    const suffix =
        seed || Math.random().toString(36).substr(2, 9);

    return `plugin-${suffix}`;
}
