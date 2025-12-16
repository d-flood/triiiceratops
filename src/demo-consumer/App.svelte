<script lang="ts">
    // @ts-ignore - Importing from dist/alias
    import { TriiiceratopsViewer } from 'triiiceratops';

    // Example manifest
    const manifestId =
        'https://iiif.io/api/cookbook/recipe/0009-book-1/manifest.json';
</script>

<div
    class="h-screen w-screen flex flex-col p-4 gap-4 bg-base-100 text-base-content"
    data-theme="consumer-theme"
>
    <div class="prose">
        <h1>Consumer Demo</h1>
        <p>
            This demo simulates a consuming application that uses
            <strong
                >SvelteKit (or Vite Svelte) + Tailwind v4 + Custom DaisyUI Theme</strong
            >.
        </p>
        <p>
            The viewer below should inherit the custom "Purple/Green" theme
            defined in
            <code>app.css</code> because the library classes are being generated
            by
            <em>this</em> app's Tailwind config via <code>@source</code>.
        </p>
    </div>

    <div
        class="flex-1 border-2 border-primary rounded-box overflow-hidden shadow-xl"
    >
        <TriiiceratopsViewer {manifestId} />
    </div>
</div>
