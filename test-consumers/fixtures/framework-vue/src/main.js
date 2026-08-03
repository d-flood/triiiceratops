import { createApp } from 'vue';

import App from './App.vue';
import { installWitness } from './events.js';
import { captureError } from './store.js';
import { installControls } from './controls.js';

installWitness();

const app = createApp(App);
// Vue's own application error handling. Recording instead of logging keeps the
// deliberate consumer-projection failure out of the console, so the fixture's
// "no uncaught page errors" assertion still means something.
app.config.errorHandler = captureError;
app.mount('#app');

installControls();
