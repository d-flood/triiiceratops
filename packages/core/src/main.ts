import { mount } from 'svelte';
import './app.css';
import Demo from './demo/Demo.svelte';
// Dev entry only — the element build never reaches this file, so the renderer's
// e2e instrumentation stays out of every shipped bundle. See
// `lib/renderer/rendererDevtools.ts`.
import './devtools/register';

const app = mount(Demo, {
    target: document.getElementById('app')!,
});

export default app;
