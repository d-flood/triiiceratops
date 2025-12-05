export class ConfigState {
    config = $state({});

    constructor(initialConfig = {}) {
        this.config = initialConfig;
    }

    setConfig(newConfig: any) {
        this.config = { ...this.config, ...newConfig };
    }

    updateConfig(updates: any) {
        this.config = { ...this.config, ...updates };
    }
}

export const configState = new ConfigState();
