import { createApp } from 'vue';
import App from './App.vue';

const host = document.getElementById('app');
if (!host) throw new Error('#app is missing from index.html');

createApp(App).mount(host);
