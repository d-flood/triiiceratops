<script lang="ts">
    import { CSS_TOKEN_GROUPS } from './cssTokens';
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
