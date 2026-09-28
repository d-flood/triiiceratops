<script lang="ts">
    import { chooseTheme, currentTheme } from './theme';

    /* Face decided in CSS from `data-theme`/`prefers-color-scheme`: script would flash the wrong icon after hydration. */

    function toggle() {
        chooseTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    }
</script>

<button class="themebtn" type="button" onclick={toggle}>
    <svg
        class="on-light"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
    >
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
    <svg
        class="on-dark"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="4.5" />
        <path
            d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
        />
    </svg>
    <span class="vh on-light">Switch to dark theme</span>
    <span class="vh on-dark">Switch to light theme</span>
</button>
