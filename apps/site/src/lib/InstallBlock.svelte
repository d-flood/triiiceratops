<script lang="ts">
    import { Tab, Tabs } from 'uncial/render';

    import CopyLine from './CopyLine.svelte';
    import {
        CDN_SNIPPET,
        PACKAGE_MANAGER_GROUP,
        PACKAGE_MANAGERS,
    } from './install';

    const labels = PACKAGE_MANAGERS.map((manager) => manager.id);

    const tabNodes = labels.map((label) => ({ type: 'tab', attrs: { label } }));
</script>

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
                        language="bash"
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
        <CopyLine
            text={CDN_SNIPPET}
            label="CDN script and element"
            language="html"
        />
        <p class="install__note">
            No build step and no framework, so it works inside a template a
            content system renders.
        </p>
    </section>
</div>
