<script lang="ts">
    import { Tab, Tabs } from 'uncial/render';

    import CopyLine from './CopyLine.svelte';
    import {
        CDN_SNIPPET,
        PACKAGE_MANAGER_GROUP,
        PACKAGE_MANAGERS,
    } from './install';

    /**
     * Both install forms, side by side: the package-manager line for a project
     * with a build step, and the script tag plus element for a page without
     * one. Installing is the conversion, so this sits immediately under the
     * hero and there is nothing else being asked for on this page.
     *
     * A tablist rather than four visible lines: four commands that differ by one
     * word invite copying the wrong one. The tabs are Uncial's, on the
     * package-manager group, so the reader's choice here is the one they see in
     * every other package-manager tab group on the site.
     */
    const labels = PACKAGE_MANAGERS.map((manager) => manager.id);

    // `Tabs` takes its labels from the tab nodes of a document, and this block's
    // panels come from a data module rather than from one. The nodes it would
    // have read are what it is given instead, so the group's selection logic is
    // shared rather than reimplemented alongside it.
    const tabNodes = labels.map((label) => ({ type: 'tab', attrs: { label } }));
</script>

<!--
    The install block preloads the mono. D36 requires the install command to be
    set in the self-hosted Source Code Pro so it renders identically here and in
    the documentation, and code above the fold is what makes that 90 KB face a
    first-paint dependency — so the pages carrying this block pay for it rather
    than every route preloading it. The global head (src/app.html) stays
    roman-only.
-->
<svelte:head>
    <link
        rel="preload"
        href="/fonts/SourceCodeVariable-Roman-Latin.woff2"
        as="font"
        type="font/woff2"
        crossorigin="anonymous"
    />
</svelte:head>

<div class="install">
    <section>
        <h2>Add it to your project</h2>
        <Tabs group={PACKAGE_MANAGER_GROUP} content={tabNodes}>
            {#each PACKAGE_MANAGERS as manager (manager.id)}
                <Tab
                    label={manager.id}
                    tabsGroup={PACKAGE_MANAGER_GROUP}
                    tabsLabels={labels}
                >
                    <CopyLine
                        text={manager.command}
                        label="{manager.id} install command"
                    />
                </Tab>
            {/each}
        </Tabs>
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
