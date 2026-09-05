<script lang="ts">
    import { page } from '$app/state';

    import '../app.css';
    import RailLinks from '$lib/RailLinks.svelte';
    import RailList from '$lib/RailList.svelte';
    import ThemeToggle from '$lib/ThemeToggle.svelte';
    import Wordmark from '$lib/Wordmark.svelte';
    import { isListed, nextListed, routeAt } from '$lib/routes';
    import {
        CONTACT_URL,
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

    let { children } = $props();

    let sheetOpen = $state(false);

    // Every route in the manifest is declared, so an undefined lookup here means
    // a route was added without a declaration — which the rail, the sitemap and
    // the crawl metadata all read. Failing visibly beats rendering a page with
    // no title and no `robots` decision.
    const route = $derived(routeAt(page.url.pathname));
    const listed = $derived(route ? isListed(route) : false);
    const next = $derived(nextListed(page.url.pathname));
    const canonical = $derived(absolute(page.url.pathname));
    // An unknown path is the not-found page, which is prerendered at /404/ and
    // then relocated to /404.html: it has no canonical URL of its own, and it is
    // already `noindex` because it is not a listed route.
    const title = $derived(
        route === undefined
            ? `Page not found — ${SITE_NAME}`
            : route.path === '/'
              ? SITE_NAME
              : `${route.shortTitle} — ${SITE_NAME}`,
    );
    const description = $derived(
        route?.intro ??
            'That page is not part of this site. The rail lists everything that is.',
    );

    // The front page doubles as the site index at phone size, so its rail stays
    // fully unrolled there instead of collapsing into the sheet.
    const isIndex = $derived(page.url.pathname === '/');
</script>

<svelte:head>
    <title>{title}</title>
    {#if route}<link rel="canonical" href={canonical} />{/if}
    <meta name="description" content={description} />
    {#if !listed}
        <!-- Unlinked from the rail and out of the sitemap for the same reason:
             an appendix, and a route whose prose has not landed, must not
             compete with a real page for a query. -->
        <meta name="robots" content="noindex" />
    {/if}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={OG_IMAGE} />
    <meta property="og:image:secure_url" content={OG_IMAGE} />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={OG_IMAGE_ALT} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content={TWITTER_HANDLE} />
    <meta name="twitter:creator" content={TWITTER_HANDLE} />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={OG_IMAGE} />
    <meta name="twitter:image:alt" content={OG_IMAGE_ALT} />
    <meta name="fediverse:creator" content={FEDIVERSE_CREATOR} />
    <meta name="theme-color" content={THEME_COLOR} />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

<header class="mbar">
    <b><Wordmark />Triiiceratops</b>
    <span class="where">{route?.shortTitle ?? ''}</span>
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
    <!-- The footer is a sibling of `main`, not a descendant: a `footer` inside a
         `main` is not a contentinfo landmark, so a screen reader user would lose
         the one region carrying the licence, the version and the contact. -->
    <div class="main">
        <main class="pagebody" id="main">{@render children()}</main>

        {#if next}
            <a class="next" href={next.path}>
                <span>
                    <span class="lbl"
                        >{next.path === '/'
                            ? 'Back to the start'
                            : 'Next'}</span
                    >
                    <span class="ttl">{next.shortTitle}</span>
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
            <a class="link" href="/system/">Design system</a>
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
        <RailList current={page.url.pathname} />
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
        <RailList
            current={page.url.pathname}
            onnavigate={() => (sheetOpen = false)}
        />
        <RailLinks />
    </div>
{/if}
