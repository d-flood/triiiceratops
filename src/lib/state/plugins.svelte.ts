export class PluginState {
    plugins: Record<string, any[]> = $state({});

    registerPlugin(slotId: string, component: any) {
        if (!this.plugins[slotId]) {
            this.plugins[slotId] = [];
        }
        this.plugins[slotId].push(component);
    }

    getPlugins(slotId: string) {
        return this.plugins[slotId] || [];
    }
}

export const pluginState = new PluginState();
