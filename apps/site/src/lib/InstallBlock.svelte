<script lang="ts">
    import CopyLine from './CopyLine.svelte';
    import { CDN_SNIPPET, PACKAGE_MANAGERS } from './install';

    /**
     * Both install forms, side by side: the package-manager line for a project
     * with a build step, and the script tag plus element for a page without
     * one. Installing is the conversion, so this sits immediately under the
     * hero and there is nothing else being asked for on this page.
     *
     * A tablist rather than four visible lines: four commands that differ by one
     * word invite copying the wrong one.
     */
    let chosen = $state(PACKAGE_MANAGERS[0].id);

    const command = $derived(
        (PACKAGE_MANAGERS.find((manager) => manager.id === chosen) ??
            PACKAGE_MANAGERS[0]).command,
    );
</script>

<div class="install">
    <section>
        <h2>Add it to your project</h2>
        <div class="pmtabs" role="tablist" aria-label="Package manager">
            {#each PACKAGE_MANAGERS as manager (manager.id)}
                <button
                    type="button"
                    role="tab"
                    id="pmtab-{manager.id}"
                    aria-selected={manager.id === chosen}
                    aria-controls="pmline"
                    tabindex={manager.id === chosen ? 0 : -1}
                    onclick={() => (chosen = manager.id)}>{manager.id}</button
                >
            {/each}
        </div>
        <div id="pmline" role="tabpanel" aria-labelledby="pmtab-{chosen}">
            <CopyLine text={command} label="{chosen} install command" />
        </div>
        <p class="install__note">
            Then import the component for React, Vue or Svelte. The <a
                class="link"
                href="/install/">install page</a
            > covers the framework specifics.
        </p>
    </section>

    <section>
        <h2>Or drop it into a page</h2>
        <CopyLine text={CDN_SNIPPET} label="CDN script and element" />
        <p class="install__note">
            No build step and no framework, so it works inside a template a
            content system renders.
        </p>
    </section>
</div>
