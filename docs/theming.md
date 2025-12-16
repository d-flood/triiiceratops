---
icon: lucide/palette
---

# Theming and Styling

Triiiceratops is designed to be highly customizable, supporting both "drop-in" theming (via DaisyUI) and deeply integrated "headless" styling (via your own Tailwind setup).

## 1. Built-in Themes (Easiest)

If you just want it to look good out of the box, use one of the 35 pre-built DaisyUI themes.

### Available Themes

| Light Themes | Dark Themes | Special Themes |
| :--- | :--- | :--- |
| `light`, `cupcake`, `bumblebee`, `emerald`, `corporate`, `garden`, `lofi`, `pastel`, `fantasy`, `autumn`, `lemonade`, `winter`, `nord`, `aqua`, `caramellatte`, `silk` | `dark`, `synthwave`, `halloween`, `forest`, `black`, `luxury`, `dracula`, `night`, `coffee`, `dim`, `abyss`, `sunset`, `business` | `cyberpunk`, `retro`, `valentine`, `wireframe`, `cmyk`, `acid` |

### Usage

=== "Web Component"

    ```html
    <triiiceratops-viewer 
        manifest-id="..." 
        theme="dark"
    ></triiiceratops-viewer>
    ```

=== "Svelte Component"

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        // Essential: Import the library styles!
        import 'triiiceratops/style.css'; 
    </script>

    <TriiiceratopsViewer 
        manifestId="..." 
        theme="dracula" 
    />
    ```

---

## 2. Custom Theme Configuration

You can override individual theme variables to match your exact brand colors without writing CSS.

### Theme Configuration Reference

The `themeConfig` object allows you to override the following properties:

#### Semantic Colors

These control the main UI elements. Colors can be **Hex** (`#3b82f6`), **RGB** (`rgb(59, 130, 246)`), or **OKLCH** (`oklch(60% 0.25 250)`).

| Keyword | Description | CSS Variable |
| :--- | :--- | :--- |
| `primary` | Primary brand color (buttons, active states) | `--color-primary` |
| `primaryContent` | Text color on primary background | `--color-primary-content` |
| `secondary` | Secondary brand color | `--color-secondary` |
| `secondaryContent` | Text color on secondary background | `--color-secondary-content` |
| `accent` | Accent brand color | `--color-accent` |
| `accentContent` | Text color on accent background | `--color-accent-content` |
| `neutral` | Neutral/Dark color (headers, footers) | `--color-neutral` |
| `neutralContent` | Text color on neutral background | `--color-neutral-content` |

#### Base Colors (Backgrounds)

| Keyword | Description | CSS Variable |
| :--- | :--- | :--- |
| `base100` | Main background color (canvas, panel) | `--color-base-100` |
| `base200` | Secondary background (sidebars, cards) | `--color-base-200` |
| `base300` | Tertiary background (inputs, borders) | `--color-base-300` |
| `baseContent` | Default text color | `--color-base-content` |

#### State Colors

| Keyword | Description | CSS Variable |
| :--- | :--- | :--- |
| `info` | Info alerts/badges | `--color-info` |
| `infoContent` | Text on info background | `--color-info-content` |
| `success` | Success alerts/badges | `--color-success` |
| `successContent` | Text on success background | `--color-success-content` |
| `warning` | Warning alerts/badges | `--color-warning` |
| `warningContent` | Text on warning background | `--color-warning-content` |
| `error` | Error alerts/badges | `--color-error` |
| `errorContent` | Text on error background | `--color-error-content` |

#### UI Shape & Sizing

| Keyword | Description | CSS Variable | Example |
| :--- | :--- | :--- | :--- |
| `radiusBox` | Radius for large containers (cards, modals) | `--radius-box` | `1rem` |
| `radiusField` | Radius for inputs and buttons | `--radius-field` | `0.5rem` |
| `radiusSelector` | Radius for small selectors (checkboxes) | `--radius-selector` | `0.25rem` |
| `sizeField` | Base padding/size for inputs | `--size-field` | `0.25rem` |
| `sizeSelector` | Base padding/size for selectors | `--size-selector` | `0.25rem` |
| `border` | Border width | `--border` | `1px` |

#### Effects

| Keyword | Description | CCS Variable | Example |
| :--- | :--- | :--- | :--- |
| `depth` | Enable drop shadows? (1 = yes, 0 = no) | `--depth` | `1` |
| `noise` | Enable noise texture? (1 = yes, 0 = no) | `--noise` | `0` |

### Example Usage

=== "Web Component (HTML Attribute)"

    ```html
    <triiiceratops-viewer
        manifest-id="..."
        theme="light"
        theme-config='{"primary":"#ff0000","radiusBox":"0px"}'
    ></triiiceratops-viewer>
    ```

=== "Web Component (JavaScript)"

    ```html
    <triiiceratops-viewer manifest-id="..."></triiiceratops-viewer>

    <script>
        const viewer = document.querySelector('triiiceratops-viewer');
        viewer.theme = 'light';
        viewer.themeConfig = {
            primary: '#3b82f6',
            secondary: '#8b5cf6',
            accent: '#f59e0b',
            base100: '#ffffff',
            base200: '#f3f4f6',
            baseContent: '#1f2937',
            radiusBox: '0.75rem',
            radiusField: '0.5rem',
            border: '2px',
        };
    </script>
    ```

=== "Svelte Component"

    ```html
    <script>
        import { TriiiceratopsViewer } from 'triiiceratops';
        import 'triiiceratops/style.css';
        import type { ThemeConfig } from 'triiiceratops';
    
        const customTheme: ThemeConfig = {
            primary: '#0ea5e9',
            secondary: '#6366f1',
            radiusBox: '1rem',
        };
    </script>
    
    <TriiiceratopsViewer manifestId="..." theme="light" themeConfig={customTheme} />
    ```

---

## 3. Advanced: SvelteKit + Tailwind Integration (Headless)

If you are building a **SvelteKit** or **Vite + Svelte** application that already uses **Tailwind CSS v4**, you do not need to import our CSS file (`triiiceratops/style.css`).

Instead, you can use the `@source` directive to tell your Tailwind compiler to scan the Triiiceratops library files. This allows you to:

1. **Deduplicate CSS**: Generate only the styles used by the viewer, merged with your app's styles.
2. **Theme via CSS**: Define your themes directly in your own CSS using standard Tailwind/DaisyUI `@theme` blocks.

### Step-by-Step Guide

1. **Install Dependencies**: ensure you have Tailwind v4 installed.
2. **Configure CSS**: In your main CSS file (e.g., `src/app.css`):

```css
@import "tailwindcss";

/* 
   Tell Tailwind to scan the Triiiceratops library in node_modules.
   This finds all the classes used inside the viewer.
*/
@source "../node_modules/triiiceratops/dist";

@plugin "daisyui" {
    /* Define which themes you want available */
    themes: light --default, dark --prefersdark, my-custom-theme;
}

/* Now you can define a custom theme in pure CSS! */
@theme my-custom-theme {
    --color-primary: oklch(65% 0.25 260); /* Purple */
    --color-secondary: oklch(80% 0.1 50); /* Orange */
    --radius-box: 0px;                    /* Square corners */
}
```

3. **Consume the Component**:
    import `TriiiceratopsViewer` as usual, but **DO NOT** import `style.css`.

4. **Apply Your Theme**:
    You can now apply your custom theme using standard CSS inheritance or the `data-theme` attribute on a parent container.

```html
<!-- src/routes/+page.svelte -->
<div data-theme="my-custom-theme">
    <TriiiceratopsViewer manifestId="..." />
</div>
```

This efficiently builds the viewer's styles into *your* application's stylesheet.
