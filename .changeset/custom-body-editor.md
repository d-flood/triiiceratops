---
'triiiceratops': minor
---

Annotation editor: add a custom body editor API. Hosts can replace the built-in body UI with either a Svelte component or a plain DOM `render(container, api)` hook while the plugin keeps owning selection, deletion, hydration state, and persistence. Structured annotation bodies are now preserved verbatim through custom saves, and the default editor renders unknown body shapes read-only instead of dropping them.
