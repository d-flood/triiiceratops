<script lang="ts">
    import { CSS_TOKEN_GROUPS } from './cssTokens';

    /**
     * Every public CSS custom property the viewer honours, with the
     * `themeConfig` key that sets it.
     *
     * Derived, not transcribed: the rows come from the committed token report,
     * which is generated from the viewer's own token registry. A token added,
     * renamed or removed there appears here on the next build, and there is no
     * second copy of the list for a check gate to compare against.
     */
</script>

<section class="tokentable">
    {#each CSS_TOKEN_GROUPS as group (group.label)}
        <h4 id={group.slug}>{group.label}</h4>
        <div class="uncial-table-scroll">
            <table>
                <tbody>
                    <tr>
                        <th>CSS variable</th>
                        <th><code>themeConfig</code> key</th>
                    </tr>
                    {#each group.tokens as token (token.name)}
                        <tr>
                            <td><code>{token.name}</code></td>
                            <td>
                                {#if token.themeConfigKey}
                                    <code>{token.themeConfigKey}</code>
                                {:else}
                                    — (raw only)
                                {/if}
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/each}
</section>
