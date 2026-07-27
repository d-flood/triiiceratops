import { mount } from 'svelte';
// The ONLY viewer stylesheet — the published package export a Svelte consumer
// imports. If this file lacked the tokens/themes (the regression), the viewer
// below would render unstyled.
import 'triiiceratops/style.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
