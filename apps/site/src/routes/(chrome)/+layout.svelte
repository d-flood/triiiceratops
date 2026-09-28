<script lang="ts">
    import RailLinks from '$lib/RailLinks.svelte';
    import RailList from '$lib/RailList.svelte';
    import Search from '$lib/Search.svelte';
    import ThemeToggle from '$lib/ThemeToggle.svelte';
    import Wordmark from '$lib/Wordmark.svelte';
    import { isDocPath } from '$lib/routes';
    import {
        CONTACT_URL,
        DOCS_OG_IMAGE,
        DOCS_OG_IMAGE_ALT,
        FEDIVERSE_CREATOR,
        LICENCE,
        OG_IMAGE,
        OG_IMAGE_ALT,
        REPOSITORY_URL,
        SITE_NAME,
        THEME_COLOR,
        TWITTER_HANDLE,
        absolute,
    } from '$lib/site';

    let { children, data } = $props();

    let sheetOpen = $state(false);

    const path = $derived(data.path);
    const current = $derived(data.current);
    const indexed = $derived(current?.indexed === true);
    const canonical = $derived(absolute(path));
    const title = $derived(
        current === undefined
            ? `Page not found — ${SITE_NAME}`
            : current.path === '/'
              ? SITE_NAME
              : `${current.shortTitle} — ${SITE_NAME}`,
    );
    const description = $derived(
        current?.intro ?? 'That page is not part of this site.',
    );

    const isIndex = $derived(path === '/');

    const card = $derived(
        isDocPath(path)
            ? { image: DOCS_OG_IMAGE, alt: DOCS_OG_IMAGE_ALT }
            : { image: OG_IMAGE, alt: OG_IMAGE_ALT },
    );
</script>

<svelte:head>
    <title>{title}</title>
    {#if current}<link rel="canonical" href={canonical} />{/if}
    <meta name="description" content={description} />
    {#if !indexed}
        <meta name="robots" content="noindex" />
    {/if}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={card.image} />
    <meta property="og:image:secure_url" content={card.image} />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={card.alt} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content={TWITTER_HANDLE} />
    <meta name="twitter:creator" content={TWITTER_HANDLE} />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={card.image} />
    <meta name="twitter:image:alt" content={card.alt} />
    <meta name="fediverse:creator" content={FEDIVERSE_CREATOR} />
    <meta name="theme-color" content={THEME_COLOR} />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

<header class="mbar">
    <b><Wordmark />Triiiceratops</b>
    <span class="where">{current?.shortTitle ?? ''}</span>
    <button
        class="open"
        type="button"
        aria-label="Open navigation"
        aria-expanded={sheetOpen}
        aria-controls="nav-sheet"
        onclick={() => (sheetOpen = true)}
    >
        <i></i><i></i><i></i>
    </button>
</header>

<div class="shell" class:shell--index={isIndex}>
    <div class="main">
        <main
            class="pagebody"
            id="main"
            data-pagefind-body={current ? '' : undefined}
        >
            {@render children()}
        </main>

        {#if data.next}
            <a class="next" href={data.next.path}>
                <span>
                    <span class="lbl"
                        >{data.next.path === '/'
                            ? 'Back to the start'
                            : 'Next'}</span
                    >
                    <span class="ttl">{data.next.shortTitle}</span>
                </span>
                <span class="go" aria-hidden="true">→</span>
            </a>
        {/if}

        <footer class="sitefoot">
            <span>{SITE_NAME}</span>
            <span>{LICENCE} licensed</span>
            <span
                >Version {__SITE_VERSION__}, dated {__SITE_VERSION_DATE__}</span
            >
            <a href={REPOSITORY_URL}>Source on GitHub</a>
            <a href={CONTACT_URL}>Contact</a>
        </footer>
    </div>

    <nav class="rail" aria-label="Site navigation">
        <div class="rail__top">
            <a class="rail__brand" href="/">
                <Wordmark eye />
                <b>Triiiceratops</b>
            </a>
            <ThemeToggle />
        </div>
        <Search />
        <RailList nav={data.nav} current={path} />
        <RailLinks />
    </nav>
</div>

{#if sheetOpen}
    <div
        class="sheet"
        id="nav-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
    >
        <div class="sheet__top">
            <b><Wordmark />Triiiceratops</b>
            <div class="sheet__controls">
                <ThemeToggle />
                <button type="button" onclick={() => (sheetOpen = false)}
                    >Close</button
                >
            </div>
        </div>
        <Search id="sheet-search" />
        <RailList
            nav={data.nav}
            current={path}
            onnavigate={() => (sheetOpen = false)}
        />
        <RailLinks />
    </div>
{/if}
