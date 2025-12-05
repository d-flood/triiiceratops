export class PluginState {
    plugins = $state({});

    registerPlugin(slotId, component) {
        if (!this.plugins[slotId]) {
            this.plugins[slotId] = [];
        }
        this.plugins[slotId].push(component);
    }

    getPlugins(slotId) {
        return this.plugins[slotId] || [];
    }
}

export const pluginState = new PluginState();
