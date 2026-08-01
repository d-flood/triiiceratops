import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

import { App, captureError, installControls } from './app.js';
import { installWitness } from './events.js';

installWitness();

// React 19's own error plumbing. Recording instead of logging keeps the
// deliberate consumer-projection failure out of the console, so the fixture's
// "no uncaught page errors" assertion still means something.
const root = createRoot(document.getElementById('app'), {
    onCaughtError: captureError,
    onUncaughtError: captureError,
    onRecoverableError: captureError,
});
root.render(h(App));
installControls();
