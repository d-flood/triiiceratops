<script lang="ts">
    /**
     * The IIIF Content State conformance table: every form the viewer resolves,
     * pinned by a committed fixture.
     *
     * Script-owned rather than live-derived. The fixture index is package test
     * material, which an application may not import, so
     * `scripts/docs-content-state.mjs` reads it and writes these rows into this
     * block's attributes. The block is read-only, and the script's `--check`
     * mode compares the committed document against a regeneration byte for
     * byte — which is what makes the read-only guarantee load-bearing here
     * rather than decorative.
     *
     * A fixture's `form` and `resolvesVia` are prose carrying backticked code
     * spans, as the index writes them, so they are rendered as prose rather than
     * emitted whole.
     */
    type Fixture = {
        readonly form: string;
        readonly resolvesVia: string;
        readonly file: string;
        readonly recipe: string | null;
        readonly capturedAt: string;
    };

    let { fixtures = [] }: { fixtures?: readonly Fixture[] } = $props();

    const RECIPE_BASE = 'https://iiif.io/api/cookbook/recipe/';
    const TEST_FILE = 'packages/core/src/lib/utils/contentState.test.ts';

    /** A prose cell split into its plain runs and its code spans. */
    function spans(text: string): { code: boolean; text: string }[] {
        return text
            .split(/`([^`]+)`/)
            .map((part, index) => ({ code: index % 2 === 1, text: part }))
            .filter((span) => span.text.length > 0);
    }
</script>

{#snippet prose(text: string)}
    {#each spans(text) as span, index (index)}{#if span.code}<code
                >{span.text}</code
            >{:else}{span.text}{/if}{/each}
{/snippet}

<p>
    {fixtures.length} committed fixtures, each parsed by
    <code>{TEST_FILE}</code>. Nothing here is fetched.
</p>

<div class="uncial-table-scroll">
    <table>
        <tbody>
            <tr>
                <th>Form</th>
                <th>Resolves via</th>
                <th>Fixture</th>
                <th>Cookbook recipe</th>
                <th>Captured</th>
            </tr>
            {#each fixtures as fixture (fixture.file)}
                <tr>
                    <td>{@render prose(fixture.form)}</td>
                    <td>{@render prose(fixture.resolvesVia)}</td>
                    <td><code>{fixture.file}</code></td>
                    <td>
                        {#if fixture.recipe}
                            <a
                                href="{RECIPE_BASE}{fixture.recipe}/"
                                target="_blank"
                                rel="noopener">{fixture.recipe}</a
                            >
                        {:else}
                            —
                        {/if}
                    </td>
                    <td>{fixture.capturedAt}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>
