import { mount } from "svelte";
import "../app.css";
import Demo from "./Demo.svelte";

mount(Demo, { target: document.getElementById("app")! });
