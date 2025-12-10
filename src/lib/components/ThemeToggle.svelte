<script>
    import { onMount } from "svelte";

    let theme = $state("light");

    const themes = [
        "light",
        "dark",
        "cupcake",
        "bumblebee",
        "emerald",
        "corporate",
        "synthwave",
        "retro",
        "cyberpunk",
        "valentine",
        "halloween",
        "garden",
        "forest",
        "aqua",
        "lofi",
        "pastel",
        "fantasy",
        "wireframe",
        "black",
        "luxury",
        "dracula",
        "cmyk",
        "autumn",
        "business",
        "acid",
        "lemonade",
        "night",
        "coffee",
        "winter",
        "dim",
        "nord",
        "sunset",
    ];

    onMount(() => {
        const storedTheme = localStorage.getItem("theme");
        if (storedTheme) {
            theme = storedTheme;
        } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            theme = "dark";
        }
        document.documentElement.setAttribute("data-theme", theme);
    });

    function onThemeChange() {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
    }
</script>

<select
    class="select select-bordered select-sm w-full max-w-xs"
    bind:value={theme}
    onchange={onThemeChange}
>
    {#each themes as t}
        <option value={t}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
        </option>
    {/each}
</select>
