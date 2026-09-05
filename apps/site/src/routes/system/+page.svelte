<script lang="ts">
    import {
        AA_NON_TEXT,
        AA_TEXT,
        AMBER_ON_BONE,
        COLOURS,
        MARK_PAIRINGS,
        PAIRINGS,
        ratio,
    } from '$lib/palette';
    import { routeAt } from '$lib/routes';

    const route = routeAt('/system/');

    /**
     * The appendix renders the palette module rather than a list of its own, so
     * a token cannot be documented here with a value the shell does not use.
     */
    const rows = PAIRINGS.map((pairing) => ({
        pairing,
        light: ratio(pairing, 'light'),
        dark: ratio(pairing, 'dark'),
    }));
    const marks = MARK_PAIRINGS.map((pairing) => ({
        pairing,
        light: ratio(pairing, 'light'),
        dark: ratio(pairing, 'dark'),
    }));

    const type: { name: string; role: string; style: string }[] = [
        {
            name: '--t-display',
            role: 'Hero',
            style: 'font-size:clamp(2.5rem,5.6vw,4.8rem)',
        },
        {
            name: '--t-h1',
            role: 'Page heading',
            style: 'font-size:clamp(1.9rem,3vw,2.7rem)',
        },
        {
            name: '--t-h2',
            role: 'Section heading',
            style: 'font-size:clamp(1.35rem,1.9vw,1.75rem)',
        },
        {
            name: '--t-h3',
            role: 'Subheading',
            style: 'font-size:1.18rem;font-weight:600',
        },
        { name: '--t-body', role: 'Body', style: 'font-size:17px' },
        { name: '--t-small', role: 'Aside', style: 'font-size:15px' },
        { name: '--t-tiny', role: 'Numeral', style: 'font-size:13.5px' },
    ];

    const space = [
        ['--s1', '4px'],
        ['--s2', '8px'],
        ['--s3', '12px'],
        ['--s4', '16px'],
        ['--s5', '24px'],
        ['--s6', '32px'],
        ['--s7', '48px'],
        ['--s8', '64px'],
        ['--s9', '96px'],
    ];
</script>

<!--
    This one route preloads the italic. The appendix's captions are italic and
    sit above the fold, so it is the only route whose first paint legitimately
    needs that face — and it is 346 KB, so it pays for it here rather than making
    all eight routes preload it. The global head (src/app.html) stays roman-only.
-->
<svelte:head>
    <link
        rel="preload"
        href="/fonts/SourceSerif4Variable-Italic-Latin.woff2"
        as="font"
        type="font/woff2"
        crossorigin="anonymous"
    />
</svelte:head>

{#if route}
    <div class="pagehead">
        <h1>{route.title}</h1>
        <p class="lede">{route.intro}</p>
    </div>
{/if}

<section class="band" aria-labelledby="colour">
    <h2 id="colour">Colour</h2>
    <p class="aside">
        Two palettes, each selected and measured against its own ground rather
        than derived from the other. A token showing one swatch keeps that value
        in both schemes: a filled colour field carries its own ground with it, so
        re-stepping it would only weaken the identity.
    </p>
    <ul class="swatches">
        {#each COLOURS as token (token.name)}
            <li class="sw">
                <div class="chips">
                    <span class="chip" style="background:{token.light}"></span>
                    {#if token.dark !== token.light}
                        <span class="chip" style="background:{token.dark}"
                        ></span>
                    {/if}
                </div>
                <div class="meta">
                    <b>{token.name}</b>
                    {#if token.dark === token.light}
                        {token.light} · both schemes
                    {:else}
                        {token.light} light · {token.dark} dark
                    {/if}
                    <br /><em>{token.role}</em>
                </div>
            </li>
        {/each}
    </ul>
</section>

<section class="band band--paper" aria-labelledby="pairings">
    <h2 id="pairings">Contrast</h2>
    <p class="aside">
        Every pairing used as text, in both schemes, with its measured ratio.
        WCAG AA at body size is {AA_TEXT}, and each of the
        {rows.length} pairings below clears it.
    </p>
    <div class="ratios">
        <table>
            <caption class="vh"
                >Measured contrast ratio of every text pairing, in each scheme</caption
            >
            <thead>
                <tr>
                    <th scope="col">Pairing</th>
                    <th scope="col">Role</th>
                    <th scope="col">Light</th>
                    <th scope="col">Dark</th>
                </tr>
            </thead>
            <tbody>
                {#each rows as row (`${row.pairing.ink}|${row.pairing.ground}`)}
                    <tr>
                        <th scope="row" class="nm"
                            >{row.pairing.ink} on {row.pairing.ground}</th
                        >
                        <td>{row.pairing.role}</td>
                        <td class="num">{row.light.toFixed(2)}</td>
                        <td class="num">{row.dark.toFixed(2)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <p class="aside">
        The data marks are graphical rather than text, so their threshold is
        {AA_NON_TEXT}:
        {#each marks as mark (mark.pairing.ink)}
            <em
                >{mark.pairing.ink} on {mark.pairing.ground}
                {mark.light.toFixed(2)} light, {mark.dark.toFixed(2)} dark.</em
            >
        {/each}
        The brand amber measures {AMBER_ON_BONE.toFixed(2)} on the light page
        ground, so it can carry neither text nor a mark there — which is why the
        emphasised mark in a chart is the orange on light and the amber on dark,
        the opposite of what brand instinct wants.
    </p>
</section>

<section class="band" aria-labelledby="type">
    <h2 id="type">Type</h2>
    <p class="aside">
        One family, display through captions. Monospaced type appears only inside
        a real code block.
    </p>
    <div class="scale">
        {#each type as step (step.name)}
            <div>
                <span class="nm">{step.name}</span>
                <span style={step.style}>{step.role}</span>
            </div>
        {/each}
    </div>
</section>

<section class="band band--paper" aria-labelledby="space">
    <h2 id="space">Space</h2>
    <p class="aside">A 4px base, used for padding, gaps and rhythm alike.</p>
    <div class="scale">
        {#each space as [name, value] (name)}
            <div>
                <span class="nm">{name}</span>
                <span
                    ><span
                        style="display:inline-block;height:10px;background:var(--mark);width:{value}"
                    ></span>
                    {value}</span
                >
            </div>
        {/each}
    </div>
</section>
