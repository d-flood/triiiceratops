---
'triiiceratops': minor
---

Remove Tailwind CSS and DaisyUI as dependencies. Styling is now plain vanilla CSS with CSS-variable theme tokens, so consumers no longer need any Tailwind/DaisyUI setup.

**Breaking:** the `DaisyUITheme` type and `DAISYUI_THEMES` constant have been removed. Use `BuiltInTheme` and `BUILTIN_THEMES` instead — they expose the same values (`'light' | 'dark' | 'Teal' | 'dracula'`).
