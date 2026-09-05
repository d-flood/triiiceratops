import { mount } from 'svelte';
// The viewer's published light-DOM stylesheet, which the viewer needs in order
// to render. The page's own stylesheet follows it so that a page rule wins any
// selector collision; the page does not otherwise depend on it. See app.css.
import 'triiiceratops/style.css';
import './app.css';
import Demo from './Demo.svelte';

mount(Demo, { target: document.getElementById('app')! });
