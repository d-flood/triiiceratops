import * as messages from '../paraglide/messages.js';
import {
    getLocale,
    setLocale as baseSetLocale,
    overwriteSetLocale,
} from '../paraglide/runtime.js';

let tag = $state(getLocale());

// Wrap setLocale to update our reactive state when locale changes
overwriteSetLocale((newLocale, options) => {
    baseSetLocale(newLocale, options);
    tag = getLocale();
});

export const language = {
    get current() {
        return tag;
    },
};

export const m = new Proxy(messages, {
    get(target, prop, receiver) {
        // Register dependency by accessing the signal
        tag;
        return Reflect.get(target, prop, receiver);
    },
});
