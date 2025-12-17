import * as messages from '../paraglide/messages.js';
import {
    getLocale,
    setLocale as baseSetLocale,
    overwriteSetLocale,
} from '../paraglide/runtime.js';

// For SSR compatibility, we use a simple variable instead of $state()
// The consumer's app will handle reactivity at a higher level if needed
let currentLocale = getLocale();

// Wrap setLocale to track locale changes
overwriteSetLocale((newLocale, options) => {
    baseSetLocale(newLocale, options);
    currentLocale = getLocale();
});

export const language = {
    get current() {
        return currentLocale;
    },
};

// Re-export messages directly for SSR compatibility
// The proxy pattern with $state doesn't work during SSR
export { messages as m };
