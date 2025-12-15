import { mount } from 'svelte';
import './app.css';
import Demo from './demo/Demo.svelte';

const app = mount(Demo, {
    target: document.getElementById('app')!,
});

export default app;
