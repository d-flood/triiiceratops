<script lang="ts">
    import { chooseTheme, currentTheme } from './theme';

    /**
     * The colour-scheme toggle: a small round control in the rail's brand row.
     *
     * That row is the only one in the rail that is not a page, so the control
     * does not disturb the flat equal-weight list; and the coloured link block
     * below would imply it is a destination.
     *
     * Which face it shows is decided entirely in CSS, from `data-theme` and
     * `prefers-color-scheme` — the same two inputs the palette reads. Painting
     * it from script would mean the prerendered markup guessing a scheme it
     * cannot know, and correcting itself after hydration: a flash of the wrong
     * icon on the page whose whole point is not flashing.
     */

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
