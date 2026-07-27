---
icon: lucide/sliders-horizontal
---

# Image Manipulation

Provides brightness, contrast, saturation, invert, and grayscale controls for the displayed image. It renders as a compact **flyout** that grows out of its toolbar button — three bare vertical sliders (brightness/contrast/saturation) plus invert/grayscale toggles and a reset button, all visible and interactable at once, floating directly over the canvas with no container box.

## Setup

=== "pnpm"

    ```bash
    pnpm add @triiiceratops/plugin-image-manipulation
    ```

=== "npm"

    ```bash
    npm install @triiiceratops/plugin-image-manipulation
    ```

=== "bun"

    ```bash
    bun add @triiiceratops/plugin-image-manipulation
    ```

`ImageManipulationPlugin` is exported ready to use with no configuration
required. Add it like any plugin — see
[using plugins](plugins.md#adding-a-plugin-to-your-viewer) for the
per-framework assignment code (every example there uses this plugin).

## Examples

- [Adding a plugin to your viewer](plugins.md#adding-a-plugin-to-your-viewer) —
  mounting this exact plugin from React, Vue, Svelte, and plain HTML.
- [Controlling plugin UI at runtime](plugins.md#controlling-plugin-ui-at-runtime) —
  switching this plugin between a flyout and a docked panel responsively.
