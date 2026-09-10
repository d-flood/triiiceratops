<script lang="ts">
    import { onMount } from 'svelte';
    import {
        buildShareUrl,
        clearStoredConfig,
        clonePlain,
        createSparseTracker,
        getAtPath,
        resolveInitialConfig,
        resolveInitialView,
        setAtPath,
        writeStoredConfig,
        type SparseConfig,
    } from '@triiiceratops/config';
    import { Tab, Tabs } from 'uncial/render';
    import type { ThemeConfig } from 'triiiceratops';

    import CopyLine from '$lib/CopyLine.svelte';
    import PageHead from '$lib/PageHead.svelte';
    import BuilderPreview from '$lib/builder/BuilderPreview.svelte';
    import { FRAMEWORKS, objectText, snippet } from '$lib/builder/outputs';
    import { BUILDER_PLUGINS, type BuilderPlugin } from '$lib/builder/plugins';
    import {
        BUILDER_DEFAULTS,
        CONTROL_GROUPS,
        type BuilderControl,
    } from '$lib/builder/surface';
    import { TOKEN_GROUPS, type TokenControl } from '$lib/builder/tokens';
    import { FRAMEWORK_GROUP } from '$lib/content';
    import { HERO_EXAMPLE } from '$lib/examples';
    import { PLAYGROUND_PATH } from '$lib/site';
    import type { SitePlugin } from '$lib/sitePlugins';
    import { THEME_ATTRIBUTE, currentTheme, type Theme } from '$lib/theme';
    import type { ViewerConfig } from '$lib/viewerConfig';

    /**
     * The configuration builder.
     *
     * A reader sets the viewer's appearance and chrome against their own IIIF
     * manifest and watches one un-remounted viewer follow. The route renders
     * from code rather than from a content document because it is an
     * application; the prose around it is short enough to live here, and its
     * rules are in `app.css` with every other route's.
     *
     * The page is one stage and then its handoffs. The stage spans the whole
     * column — the treatment `/handles/` gives its own running viewer — with
     * the viewer on one side and the editor on the other, pinned to the
     * viewer's height and scrolled within itself. Every group of controls is a
     * tab of that editor rather than another screen of one long column: the
     * point of the page is watching a change land, and a control that has
     * scrolled the viewer off the screen cannot be watched landing.
     *
     * Three kinds of state, kept apart because the viewer takes them as three
     * different inputs. `config` is the viewer's configuration interface, and
     * only the keys the reader actually set are emitted — the sparse algebra for
     * that is `@triiiceratops/config`'s, shared with the playground, so a share
     * URL means the same thing on both routes. `themeOverlay` is the public
     * theming tokens, and it starts empty for the same reason: an untouched
     * token must stay the reader's own theme's answer rather than this page's.
     * `chosen` is the plugins, which are modules rather than data and therefore
     * reach a reader's page through the snippet alone.
     *
     * The URL is read on mount rather than at initialisation. The route
     * prerenders, so there is no query string at render time, and reading one
     * during hydration would make the served markup disagree with the first
     * frame.
     */

    const defaults = clonePlain(BUILDER_DEFAULTS);

    let config = $state<ViewerConfig>(clonePlain(BUILDER_DEFAULTS));
    let themeOverlay = $state<ThemeConfig>({});

    /** The untouched value of every theming token, read from the viewer. */
    let base = $state<{
        colours: Record<string, string>;
        lengths: Record<string, number>;
    }>({ colours: {}, lengths: {} });

    let manifestUrl = $state(HERO_EXAMPLE.manifest);
    let currentManifest = $state(HERO_EXAMPLE.manifest);
    let scheme = $state<Theme>('light');

    /*
     * Whatever the live configuration says that the defaults do not is the
     * reader's intent, and that overlay is what a share URL carries. The tracker
     * holds plain, non-reactive objects, so the persistence effect does not
     * re-run on its own bookkeeping.
     *
     * Seeded on mount with the overlay the load already carried, because the
     * tracker records what departs from the defaults and a key set to what
     * happens to be a default is not a departure. Without the seed a link
     * arriving with `showToggle: true` would open here correctly and be handed
     * back without it, so the same query string would mean less on the second
     * pass than on the first.
     */
    let tracker = createSparseTracker(defaults);

    /** Nothing is read from or written to storage before the URL has been read. */
    let ready = $state(false);
    let clean = false;

    const colourTokens = TOKEN_GROUPS.filter(
        (group) => group.kind === 'colour',
    ).flatMap((group) => group.tokens.map((token) => token.name));
    const lengthTokens = TOKEN_GROUPS.filter(
        (group) => group.kind === 'length',
    ).flatMap((group) => group.tokens.map((token) => token.name));

    onMount(() => {
        const search = window.location.search;

        const view = resolveInitialView(search);
        if (view.manifestUrl) {
            manifestUrl = view.manifestUrl;
            currentManifest = view.manifestUrl;
        }

        const resolved = resolveInitialConfig({ search, defaults });
        config = resolved.config;
        clean = resolved.clean;
        tracker = createSparseTracker(defaults, resolved.sparse);
        origin = window.location.origin;
        pathname = window.location.pathname;
        ready = true;

        /*
         * The preview follows the page's scheme, which the rail's toggle owns
         * and writes to `<html>`. Watching the attribute is what lets this route
         * follow it without the layout having to hand a callback down through
         * every page it renders.
         */
        const sync = () => (scheme = currentTheme());
        sync();

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, {
            attributeFilter: [THEME_ATTRIBUTE],
        });
        media.addEventListener('change', sync);

        return () => {
            observer.disconnect();
            media.removeEventListener('change', sync);
        };
    });

    /*
     * The viewer is handed a plain copy, never the tracked object.
     *
     * `ViewerState` writes the resolved viewing mode and viewing direction back
     * through the configuration it was given, so passing the reactive object
     * would have the viewer's own answer about somebody's manifest read as the
     * reader's intent — and this route emits neither of those keys.
     */
    const applied = $derived(clonePlain(config));

    /**
     * The overlay, as reactive state.
     *
     * The tracker's own object is plain and is mutated in place, so a template
     * reading it would never hear about a change. A fresh copy per run is what
     * makes the three outputs below recompute, and it is a copy for the same
     * reason `applied` is: nothing downstream may write into the tracker.
     */
    let userSet = $state<SparseConfig>({});

    $effect(() => {
        if (!ready) return;
        const recorded = tracker.record(config as SparseConfig);
        userSet = clonePlain(recorded);
        // A `clean-config` load is a bookmarkable deterministic start: it reads
        // nothing from storage and must write nothing to it either.
        if (!clean) writeStoredConfig(recorded);
    });

    /*
     * The plugins, which are the one part of a reader's answer that is not
     * data. Turning one on fetches its module — here rather than in an effect,
     * because the fetch is the consequence of the click and not of the state
     * settling — and the preview above runs whatever has arrived.
     */
    let chosenIds = $state<readonly string[]>([]);

    /*
     * Raw, and reassigned rather than mutated: activation is keyed to a
     * plugin's identity, so a plugin that reached the viewer through a deep
     * reactive proxy would be a different object from the one the module
     * exported and would restart on every unrelated change.
     */
    let loaded = $state.raw<readonly { id: string; plugin: SitePlugin }[]>([]);

    const chosen = $derived(
        BUILDER_PLUGINS.filter((plugin) => chosenIds.includes(plugin.id)),
    );
    const running = $derived(
        chosen
            .map((plugin) => loaded.find((entry) => entry.id === plugin.id))
            .filter((entry) => entry !== undefined)
            .map((entry) => entry.plugin),
    );

    async function choose(plugin: BuilderPlugin, on: boolean) {
        chosenIds = on
            ? [...chosenIds, plugin.id]
            : chosenIds.filter((id) => id !== plugin.id);
        if (!on || loaded.some((entry) => entry.id === plugin.id)) return;
        // A plugin turned off while its module was in flight must not arrive:
        // what the viewer runs is the intersection of the two, so the cache
        // growing is harmless on its own.
        loaded = [...loaded, { id: plugin.id, plugin: await plugin.load() }];
    }

    /*
     * The handoffs, each derived rather than captured on a click, so what a
     * reader copies is the state at the moment they copy it.
     *
     * The share URL is built where the reader is standing rather than against a
     * declared path, which is what makes the same string mean the same thing
     * under `/demo/`: one origin, one encoding, and `mode` at the value the
     * playground opens on. It is empty until the URL has been read, because
     * `serializeContentState` resolves relative manifests against the current
     * document and there is none while the route prerenders.
     */
    let origin = $state('');
    let pathname = $state('');

    const shareUrl = $derived(
        ready
            ? origin +
                  buildShareUrl({
                      pathname,
                      mode: 'image',
                      target: { manifestId: currentManifest },
                      config: userSet,
                  })
            : '',
    );

    const configText = $derived(objectText(userSet));
    const themeText = $derived(objectText(themeOverlay));

    const code = $derived.by(() => {
        const output = {
            manifestId: currentManifest,
            config: userSet,
            themeConfig: themeOverlay as Record<string, unknown>,
            plugins: chosen,
        };
        return new Map(
            FRAMEWORKS.map((entry) => [entry.id, snippet(entry.id, output)]),
        );
    });

    /*
     * All four snippets are rendered and the tab group hides three, which is
     * both how the documentation's own framework tabs work and what makes the
     * choice stick: a reader who picked Vue in a guide arrives here on Vue.
     *
     * `Tabs` takes its labels from a document's tab nodes, and this block's
     * panels come from a data module rather than from one, so the nodes it
     * would have read are what it is given instead.
     */
    const frameworkLabels = FRAMEWORKS.map((entry) => entry.label);
    const frameworkNodes = frameworkLabels.map((label) => ({
        type: 'tab',
        attrs: { label },
    }));

    /*
     * The editor's own tabs, which are this route's and not the documentation's:
     * eleven groups rather than four, and a keyboard reader has to be able to
     * reach every one of them from the tab that has focus.
     */
    const slug = (title: string) =>
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

    const PLUGIN_SECTION = 'plugins';

    const SECTIONS: readonly { id: string; title: string }[] = [
        ...CONTROL_GROUPS.map((group) => ({
            id: slug(group.title),
            title: group.title,
        })),
        { id: PLUGIN_SECTION, title: 'Plugins' },
        ...TOKEN_GROUPS.map((group) => ({
            id: slug(group.title),
            title: group.title,
        })),
    ];

    let section = $state(SECTIONS[0].id);
    let tablist = $state<HTMLDivElement | undefined>(undefined);

    const STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

    function steer(event: KeyboardEvent, at: number) {
        const step = STEPS[event.key];
        const to =
            step !== undefined
                ? (at + step + SECTIONS.length) % SECTIONS.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? SECTIONS.length - 1
                    : undefined;
        if (to === undefined) return;

        event.preventDefault();
        section = SECTIONS[to].id;
        tablist
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            [to]?.focus();
    }

    function read(control: BuilderControl): unknown {
        return getAtPath(config as SparseConfig, [...control.path]);
    }

    function write(control: BuilderControl, value: unknown) {
        setAtPath(config as SparseConfig, [...control.path], value);
    }

    function pixels(control: BuilderControl): number {
        return parseFloat(String(read(control) ?? '0'));
    }

    function colour(token: TokenControl): string {
        const set = themeOverlay[token.key as keyof ThemeConfig];
        return typeof set === 'string'
            ? set
            : (base.colours[token.name] ?? '#000000');
    }

    function radius(token: TokenControl): number {
        const set = themeOverlay[token.key as keyof ThemeConfig];
        return typeof set === 'string'
            ? parseFloat(set)
            : (base.lengths[token.name] ?? 0);
    }

    function setToken(token: TokenControl, value: string) {
        themeOverlay = { ...themeOverlay, [token.key]: value };
    }

    function loadManifest(event: SubmitEvent) {
        event.preventDefault();
        currentManifest = manifestUrl.trim();
    }

    function useExample() {
        manifestUrl = HERO_EXAMPLE.manifest;
        currentManifest = HERO_EXAMPLE.manifest;
    }

    function startOver() {
        config = clonePlain(BUILDER_DEFAULTS);
        themeOverlay = {};
        chosenIds = [];
        tracker.reset();
        clearStoredConfig();
        useExample();
    }

    const controlId = (control: BuilderControl) =>
        `cfg-${control.path.join('-')}`;

    const themeReady = $derived(Object.keys(base.colours).length > 0);
</script>

<PageHead />

<section class="bstage" aria-labelledby="builder-h">
    <h2 id="builder-h" class="vh">The builder</h2>

    <div class="bstage__show">
        <form class="pick" onsubmit={loadManifest}>
            <label class="pick__label" for="manifest">
                Your IIIF manifest
            </label>
            <div class="pick__row">
                <input
                    id="manifest"
                    class="pick__url"
                    type="text"
                    inputmode="url"
                    spellcheck="false"
                    placeholder="https://example.org/iiif/manifest.json"
                    bind:value={manifestUrl}
                />
                <button class="btn btn--go" type="submit">Load</button>
            </div>
            <p class="pick__note note">
                Paste the manifest of something you publish. Nothing is sent
                anywhere: the viewer fetches it from your server, in this
                browser.
                {#if currentManifest !== HERO_EXAMPLE.manifest}
                    <button class="linkish" type="button" onclick={useExample}
                        >Back to the example manifest</button
                    >
                {/if}
            </p>
        </form>

        <div class="bstage__frame">
            <BuilderPreview
                manifestId={currentManifest}
                config={applied}
                plugins={running}
                theme={scheme}
                themeConfig={themeOverlay}
                {colourTokens}
                {lengthTokens}
                onbase={(resolved) => (base = resolved)}
            />
        </div>
    </div>

    <div class="bstage__set">
        <div class="bd__head">
            <p class="note">
                Every control names a key of the viewer's own configuration
                interface, or one of its public theming tokens. Only what you
                change is carried.
            </p>
            <button class="btn" type="button" onclick={startOver}>
                Start over
            </button>
        </div>

        <div
            class="bd__tabs"
            role="tablist"
            aria-label="Configuration sections"
            bind:this={tablist}
        >
            {#each SECTIONS as entry, at (entry.id)}
                <button
                    type="button"
                    role="tab"
                    id="tab-{entry.id}"
                    aria-controls="pane-{entry.id}"
                    aria-selected={section === entry.id}
                    tabindex={section === entry.id ? 0 : -1}
                    onclick={() => (section = entry.id)}
                    onkeydown={(event) => steer(event, at)}
                >
                    {entry.title}
                </button>
            {/each}
        </div>

        <div class="bd__panes">
            {#each CONTROL_GROUPS as group (group.title)}
                <div
                    class="pane"
                    role="tabpanel"
                    id="pane-{slug(group.title)}"
                    aria-labelledby="tab-{slug(group.title)}"
                    hidden={section !== slug(group.title)}
                >
                    {#if group.note}
                        <p class="pane__note note">{group.note}</p>
                    {/if}
                    <div class="pane__body">
                        {#each group.controls as control (control.path.join('.'))}
                            {#if control.kind === 'toggle'}
                                <div class="row row--check">
                                    <input
                                        id={controlId(control)}
                                        type="checkbox"
                                        checked={read(control) === true}
                                        onchange={(event) =>
                                            write(
                                                control,
                                                event.currentTarget.checked,
                                            )}
                                    />
                                    <label for={controlId(control)}>
                                        {control.label}
                                    </label>
                                </div>
                            {:else if control.kind === 'choice'}
                                <div class="row">
                                    <label for={controlId(control)}>
                                        {control.label}
                                    </label>
                                    <select
                                        id={controlId(control)}
                                        value={String(read(control) ?? '')}
                                        onchange={(event) =>
                                            write(
                                                control,
                                                event.currentTarget.value,
                                            )}
                                    >
                                        {#each control.choices as choice (choice.value)}
                                            <option value={choice.value}>
                                                {choice.label}
                                            </option>
                                        {/each}
                                    </select>
                                </div>
                            {:else}
                                <div class="row">
                                    <label for={controlId(control)}>
                                        {control.label}
                                        <span class="row__value">
                                            {control.kind === 'pixels'
                                                ? `${pixels(control)}px`
                                                : read(control)}
                                        </span>
                                    </label>
                                    <input
                                        id={controlId(control)}
                                        type="range"
                                        min={control.min}
                                        max={control.max}
                                        step={control.step}
                                        value={control.kind === 'pixels'
                                            ? pixels(control)
                                            : Number(read(control) ?? 0)}
                                        oninput={(event) =>
                                            write(
                                                control,
                                                control.kind === 'pixels'
                                                    ? `${event.currentTarget.value}px`
                                                    : Number(
                                                          event.currentTarget
                                                              .value,
                                                      ),
                                            )}
                                    />
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/each}

            <div
                class="pane"
                role="tabpanel"
                id="pane-{PLUGIN_SECTION}"
                aria-labelledby="tab-{PLUGIN_SECTION}"
                hidden={section !== PLUGIN_SECTION}
            >
                <p class="pane__note note">
                    The first-party plugins, each its own package. One you turn
                    on runs in the viewer above and is registered in the code
                    below; it reaches neither the configuration object nor the
                    link, because a plugin is a module and neither of those can
                    carry one.
                </p>
                <div class="pane__body">
                    {#each BUILDER_PLUGINS as plugin (plugin.id)}
                        <div class="row row--plug">
                            <input
                                id="plug-{plugin.id}"
                                type="checkbox"
                                checked={chosenIds.includes(plugin.id)}
                                onchange={(event) =>
                                    choose(plugin, event.currentTarget.checked)}
                            />
                            <label for="plug-{plugin.id}">
                                {plugin.label}
                                <span class="row__say">{plugin.say}</span>
                                <code class="row__token">{plugin.pkg}</code>
                            </label>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- The theming controls appear once the viewer's own palette has
                 been read off its stylesheet: a swatch has no honest value
                 before that, and prerendering forty-five of them would put
                 their weight on the load of a page that argues about weight.
                 The tabs are there from the first paint all the same, so the
                 row of them does not grow under the reader's pointer. -->
            {#each TOKEN_GROUPS as group (group.title)}
                <div
                    class="pane"
                    role="tabpanel"
                    id="pane-{slug(group.title)}"
                    aria-labelledby="tab-{slug(group.title)}"
                    hidden={section !== slug(group.title)}
                >
                    <p class="pane__note note">{group.note}</p>
                    {#if themeReady}
                        <div class="pane__body">
                            {#each group.tokens as token (token.key)}
                                <div class="row">
                                    <label for={`tok-${token.key}`}>
                                        {token.label}
                                        <code class="row__token">
                                            {token.name}
                                        </code>
                                    </label>
                                    {#if group.kind === 'colour'}
                                        <input
                                            id={`tok-${token.key}`}
                                            type="color"
                                            value={colour(token)}
                                            oninput={(event) =>
                                                setToken(
                                                    token,
                                                    event.currentTarget.value,
                                                )}
                                        />
                                    {:else}
                                        <input
                                            id={`tok-${token.key}`}
                                            type="range"
                                            min="0"
                                            max="32"
                                            step="1"
                                            value={radius(token)}
                                            oninput={(event) =>
                                                setToken(
                                                    token,
                                                    `${event.currentTarget.value}px`,
                                                )}
                                        />
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</section>

<section class="band band--paper handoff" aria-labelledby="take">
    <div class="prose">
        <h2 id="take">Take it with you</h2>
        <p>
            Everything below is the state of the viewer above at the moment you
            copy it, and all of it sparse: what you changed, and nothing else. A
            key you never touched stays whatever the manifest, the theme or a
            later release says it should be.
        </p>
    </div>

    <div class="hand">
        <section class="hand__one" aria-labelledby="out-config">
            <h3 id="out-config">The configuration</h3>
            <p class="note">
                The viewer's <code>config</code> input, for storing in a content system
                and handing to whoever builds the page.
            </p>
            <CopyLine
                text={configText}
                label="configuration object"
                language="js"
            />
            <p class="note">
                The colors and corners travel as a second object, because the
                viewer takes them as a separate input: <code>themeConfig</code>.
                It stays empty until you change one.
            </p>
            <CopyLine
                text={themeText}
                label="theme configuration object"
                language="js"
            />
        </section>

        <section class="hand__one" aria-labelledby="out-link">
            <h3 id="out-link">The link</h3>
            <p class="note">
                Send this to a colleague and it opens on your manifest, arranged
                the way you arranged it. It also opens in the
                <a class="link" href={PLAYGROUND_PATH}>playground</a>, where the
                rest of the configuration interface is — same query string, same
                meaning. It carries the arrangement and the theme; the plugins
                are packages a build installs, so they travel in the code below.
            </p>
            <CopyLine text={shareUrl} label="share link" />
        </section>

        <section class="hand__one" aria-labelledby="out-code">
            <h3 id="out-code">The code</h3>
            <p class="note">
                The whole integration, in the framework you build in — the
                configuration, the theme and the plugins you turned on. This is
                the argument the page is making: everything above is
                configuration, and none of it is a different build.
            </p>
            <Tabs group={FRAMEWORK_GROUP} content={frameworkNodes}>
                {#each FRAMEWORKS as entry (entry.id)}
                    <Tab
                        label={entry.label}
                        tabsGroup={FRAMEWORK_GROUP}
                        tabsLabels={frameworkLabels}
                    >
                        <CopyLine
                            text={code.get(entry.id) ?? ''}
                            label="{entry.label} snippet"
                            language={entry.language}
                        />
                        <p class="note">
                            <a class="link" href={entry.href}>
                                The {entry.label} guide
                            </a>
                            covers everything this snippet leaves out.
                        </p>
                    </Tab>
                {/each}
            </Tabs>
        </section>
    </div>
</section>

<section class="band band--paper" aria-labelledby="elsewhere">
    <div class="prose">
        <h2 id="elsewhere">What this page deliberately does not set</h2>
        <p>
            This is appearance and chrome: where the controls sit, which buttons
            exist, what the viewer is painted in, and which plugins it is built
            with. How the viewer reads a manifest is a different question, and
            it is answered somewhere a reader can experiment without leaving a
            share link behind.
        </p>
        <p>
            Viewing mode and viewing direction, search providers and renderer
            tuning are set in the
            <a class="link" href={PLAYGROUND_PATH}>playground</a>, which exposes
            the whole configuration interface. A URL built there opens here, and
            a URL built here opens there, and it means the same thing in both.
        </p>
    </div>
</section>
