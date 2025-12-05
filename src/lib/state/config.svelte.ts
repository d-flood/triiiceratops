export class ConfigState {
    config = $state({});

    constructor(initialConfig = {}) {
        this.config = initialConfig;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
}

export const configState = new ConfigState();
