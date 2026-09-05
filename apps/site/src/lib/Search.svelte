<script lang="ts">
    import { SEARCH_BUNDLE_PATH } from './site';

    /**
     * Search across the whole site's prose: the marketing pages and the
     * documentation, in one field, because they are one site.
     *
     * The index is a post-build artefact, so the bundle is fetched at runtime
     * from its published path rather than imported. It is fetched on the first
     * keystroke and not before: a reader who never searches pays nothing, and
     * the score gate never sees the request.
     *
     * On a development server there is no index — it does not exist until the
     * build has run — so the field says so instead of failing silently.
     */

    type Result = {
        readonly url: string;
        readonly meta: { readonly title?: string };
        readonly excerpt: string;
    };

    type Pagefind = {
        search: (
            term: string,
        ) => Promise<{ results: { data: () => Promise<Result> }[] }>;
    };

    let { id = 'site-search' }: { id?: string } = $props();

    let query = $state('');
    let results = $state<Result[]>([]);
    let searching = $state(false);
    let unavailable = $state(false);

    /** Results beyond this are noise in a rail-width list. */
    const LIMIT = 8;

    /** Long enough that typing a word does not fetch a result for each letter. */
    const DEBOUNCE = 150;

    let engine: Promise<Pagefind> | undefined;

    function pagefind(): Promise<Pagefind> {
        engine ??= import(
            /* @vite-ignore */ SEARCH_BUNDLE_PATH
        ) as Promise<Pagefind>;
        return engine;
    }

    // A query issued after this one has landed; anything older is dropped rather
    // than allowed to overwrite it out of order.
    let latest = 0;

    async function run(term: string) {
        const issued = ++latest;
        let found: Result[];
        try {
            const search = await (await pagefind()).search(term);
            found = await Promise.all(
                search.results.slice(0, LIMIT).map((result) => result.data()),
            );
        } catch {
            unavailable = true;
            results = [];
            searching = false;
            return;
        }
        if (issued !== latest) return;
        results = found;
        searching = false;
    }

    let pending: ReturnType<typeof setTimeout> | undefined;

    function onInput() {
        clearTimeout(pending);
        const term = query.trim();
        if (term.length < 2) {
            latest++;
            results = [];
            searching = false;
            return;
        }
        searching = true;
        pending = setTimeout(() => run(term), DEBOUNCE);
    }

    const status = $derived(
        unavailable
            ? 'The index is built with the site, so there is nothing to search on a development server.'
            : searching
              ? 'Searching…'
              : query.trim().length < 2
                ? ''
                : results.length === 0
                  ? `No page matches ${query.trim()}.`
                  : `${results.length} page${results.length === 1 ? '' : 's'} match ${query.trim()}.`,
    );
</script>

<search class="search">
    <label class="vh" for={id}>Search this site</label>
    <input
        {id}
        class="search__field"
        type="search"
        autocomplete="off"
        placeholder="Search the site"
        bind:value={query}
        oninput={onInput}
    />
    <!-- A live region rather than a silent list: a query that matches nothing
         has to say so, and the count is what tells a screen reader user the
         list below has changed. Always in the document — a region created at
         the moment its text appears is announced by nothing. -->
    <p class="search__status" role="status">{status}</p>
    {#if results.length > 0}
        <ul class="search__results">
            {#each results as result (result.url)}
                <li>
                    <a href={result.url}>
                        <b>{result.meta.title ?? result.url}</b>
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -- Pagefind's excerpt is built from this site's own pages at build time, and its only markup is the `mark` it wraps the matched words in; the page text it draws from is escaped. -->
                        <span>{@html result.excerpt}</span>
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
</search>
