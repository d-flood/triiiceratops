// Re-export messages directly from paraglide
// The 'm' export is provided by paraglide's messages.js
export { m } from '../paraglide/messages.js';

import {
    getLocale,
    setLocale as baseSetLocale,
    overwriteSetLocale,
} from '../paraglide/runtime.js';

// For SSR compatibility, we use a simple variable instead of $state()
let currentLocale = $state(getLocale());

// Capture the original setLocale before overwriting it
const originalSetLocale = baseSetLocale;

// Wrap setLocale to track locale changes
overwriteSetLocale((newLocale, options) => {
    originalSetLocale(newLocale, options);
    currentLocale = getLocale();
});

export const language = {
    get current() {
        return currentLocale;
    },
};
