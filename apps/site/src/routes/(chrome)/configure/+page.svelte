<script lang="ts">
    import { onMount } from 'svelte';
    import {
        buildShareUrl,
        clearStoredConfig,
        clonePlain,
        collectPaths,
        diffSparse,
        getAtPath,
        mergeSparse,
        pruneSparse,
        resolveInitialConfig,
        resolveInitialView,
        setAtPath,
        writeStoredConfig,
        type SparseConfig,
    } from '@triiiceratops/config';
    import { Tab, Tabs } from 'uncial/render';
    import type { BuiltInTheme, ThemeConfig } from 'triiiceratops';

    import CopyLine from '$lib/CopyLine.svelte';
    import PageHead from '$lib/PageHead.svelte';
    import BuilderPreview from '$lib/builder/BuilderPreview.svelte';
    import { FRAMEWORKS, objectText, snippet } from '$lib/builder/outputs';
    import { BUILDER_PLUGINS, type BuilderPlugin } from '$lib/builder/plugins';
    import {
        BUILDER_DEFAULTS,
        CONTROL_GROUPS,
        PLUGIN_UI_CONTROLS,
        PLUGIN_UI_DEFAULTS,
        type BuilderControl,
    } from '$lib/builder/surface';
    import {
        THEME_CHOICES,
        TOKEN_GROUPS,
        type TokenControl,
    } from '$lib/builder/tokens';
    import { FRAMEWORK_GROUP } from '$lib/content';
    import { HERO_EXAMPLE } from '$lib/examples';
    import type { SitePlugin } from '$lib/sitePlugins';
    import { currentTheme } from '$lib/theme';
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
     * column — the treatment `/features/` gives its own running viewer — with
     * the viewer on one side and the editor on the other, pinned to the
     * viewer's height and scrolled within itself. Every group of controls is a
     * tab of that editor rather than another screen of one long column: the
     * point of the page is watching a change land, and a control that has
     * scrolled the viewer off the screen cannot be watched landing.
     *
     * Three kinds of state, kept apart because the viewer takes them as three
     * different inputs. `config` is the viewer's configuration interface, and
     * only the keys the reader actually set are emitted — the sparse algebra for
     * that is `@triiiceratops/config`'s, which is also what reads a share URL
     * back. `themeOverlay` is the public
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
        percents: Record<string, number>;
    }>({ colours: {}, lengths: {}, percents: {} });

    let manifestUrl = $state(HERO_EXAMPLE.manifest);
    let currentManifest = $state(HERO_EXAMPLE.manifest);

    /**
     * The theme the reader starts from, always one of the four.
     *
     * Named rather than left to the viewer's own defaults, and the snippet
     * carries the name: an override is only reproducible if the ground under
     * it is, and `light` — which is what the defaults are — is a ground with a
     * name. Seeded on mount from the scheme the page is in, so a reader arrives
     * on a viewer that agrees with the page around it rather than on somebody's
     * idea of a starting theme.
     *
     * It does not go on following the toggle after that. A theme moving under
     * the values a reader has set is the one thing this control must not do,
     * and a chip that changed by itself while they were reading it is close
     * behind.
     *
     * The theme is the ground, not a layer over the reader's work: their token
     * overrides survive a change of it, because that is the relationship the
     * viewer itself implements — `themeConfig` beats `theme` — and this page is
     * where it has to be visible. `Start over` is what clears both.
     */
    let theme = $state<BuiltInTheme>('light');

    /**
     * What the load arrived carrying: a link's `config`, or the overlay held
     * from a previous visit.
     *
     * The overlay below is whatever the live configuration says that the
     * defaults do not, and that on its own would narrow a link on its way back
     * out. A sender is free to declare a key whose value happens to be this
     * page's own default — a colleague who set it deliberately, a developer who
     * wrote the query string by hand — and a round trip that dropped it would
     * make the same query string mean less on the second pass than on the
     * first. So a key that arrived travels on for as long as it still holds the
     * value it arrived with, and stops the moment the reader moves off it.
     */
    let declared = $state<SparseConfig>({});

    /** Nothing is read from or written to storage before the URL has been read. */
    let ready = $state(false);
    let clean = false;

    const named = (kind: TokenControl['kind']) =>
        TOKEN_GROUPS.flatMap((group) =>
            group.tokens
                .filter((token) => token.kind === kind)
                .map((token) => token.name),
        );

    const colourTokens = named('colour');
    const lengthTokens = named('length');
    const percentTokens = named('percent');

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
        declared = resolved.sparse;
        origin = window.location.origin;
        pathname = window.location.pathname;
        theme = currentTheme();
        ready = true;
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
     * The keys of `from` the live configuration still agrees with.
     *
     * Leaf by leaf, because a link declares leaves: a sender who set the
     * gallery's size and nothing else about the gallery must not have the
     * reader's own dock position read as agreement with the rest of it.
     */
    function held(live: SparseConfig, from: SparseConfig): SparseConfig {
        const kept: SparseConfig = {};
        for (const path of collectPaths(from)) {
            const value = getAtPath(from, path);
            if (getAtPath(live, path) === value) {
                setAtPath(kept, path, value);
            }
        }
        return kept;
    }

    /**
     * The overlay: what a reader would have to state to get the viewer they are
     * looking at, and nothing else.
     *
     * It is derived from the live configuration rather than accumulated as the
     * reader works, so a value put back where it started leaves nothing behind
     * — a toggle turned on and off again, or an emptied field, has been
     * decided about and then undecided, and an overlay that still carried it
     * would hand somebody else a key its own sender no longer means.
     *
     * `pruneSparse` is what drops a retraction: a control with an `unset` option
     * writes `undefined` rather than deleting its key, because the diff below
     * reads what the configuration says and would never look for a key that had
     * gone.
     */
    const userSet = $derived(
        pruneSparse(
            mergeSparse(
                held(config as SparseConfig, declared),
                diffSparse(config as SparseConfig, defaults as SparseConfig),
            ),
        ),
    );

    $effect(() => {
        if (!ready) return;
        // A `clean-config` load is a bookmarkable deterministic start: it reads
        // nothing from storage and must write nothing to it either.
        if (!clean) writeStoredConfig(userSet);
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
     * declared path, so it stays correct under whatever prefix the site is
     * served from. It is empty until the URL has been read, because
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
            theme,
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
     * twelve labels rather than four, and a keyboard reader has to be able to
     * reach every one of them from the tab that has focus.
     */
    const slug = (title: string) =>
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

    const PLUGIN_SECTION = 'plugins';

    /**
     * The tabs, in the two halves the editor actually has.
     *
     * Twelve labels in one undivided row asks a reader to know which of them
     * are about what the viewer does and which are about what it looks like,
     * and the two are answered by different inputs and copied out of this page
     * as different objects. The plugins sit in the first half: a plugin is part
     * of what the viewer is rather than of how it is painted, whatever else its
     * own panel says about where it travels.
     */
    const TAB_GROUPS: readonly {
        title: string;
        sections: readonly { id: string; title: string }[];
    }[] = [
        {
            title: 'The viewer',
            sections: [
                ...CONTROL_GROUPS.map((group) => ({
                    id: slug(group.title),
                    title: group.title,
                })),
                { id: PLUGIN_SECTION, title: 'Plugins' },
            ],
        },
        {
            title: 'The theme',
            sections: TOKEN_GROUPS.map((group) => ({
                id: slug(group.title),
                title: group.title,
            })),
        },
    ];

    /** One roving tab stop over all of them: the groups divide the row, not the widget. */
    const SECTIONS: readonly { id: string; title: string }[] =
        TAB_GROUPS.flatMap((group) => group.sections);

    /**
     * The theming half, which is where the theme itself is offered: the choice
     * is the ground all five of those groups read through, so it stands at the
     * head of the group rather than inside one of its tabs, where the other
     * four would not show what had moved their swatches.
     */
    const THEME_SECTIONS = new Set(
        TOKEN_GROUPS.map((group) => slug(group.title)),
    );

    let section = $state(SECTIONS[0].id);
    const theming = $derived(THEME_SECTIONS.has(section));

    /**
     * The choice is offered until there is work of the reader's own for it to
     * disturb, and then it is fixed.
     *
     * A theme moves every token the reader has not set, and a reader who has
     * set some cannot see from the switcher which of the others would move. So
     * the moment they set one, the switcher goes and says what it started
     * from: nothing on this page may quietly change the ground under a value
     * somebody chose. Until then it is free to try, which is worth keeping —
     * comparing two themes on your own material is half of why the page exists.
     *
     * `Start over` is the way back, and it is the honest one: starting from a
     * different theme is starting again.
     */
    const fixed = $derived(Object.keys(themeOverlay).length > 0);

    /** How the choice is named once it is fixed and only prose can say it. */
    const startedFrom = $derived(
        THEME_CHOICES.find((choice) => choice.value === theme)?.label ?? '',
    );
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

    /*
     * A per-plugin control, rooted at the plugin's own key. The declarations
     * are relative because the key is not known until a reader turns the
     * plugin on.
     */
    function pluginControl(
        plugin: BuilderPlugin,
        control: BuilderControl,
    ): BuilderControl {
        return { ...control, path: ['plugins', plugin.id, ...control.path] };
    }

    /*
     * A per-plugin control's value, falling back to the key's documented
     * default so an untouched toggle shows where the plugin actually stands.
     * The fallback is not written: nothing reaches `plugins` until a reader
     * moves something.
     */
    function readPlugin(control: BuilderControl): unknown {
        const set = read(control);
        return set ?? PLUGIN_UI_DEFAULTS[control.path[2]];
    }

    function read(control: BuilderControl): unknown {
        return getAtPath(config as SparseConfig, [...control.path]);
    }

    function write(control: BuilderControl, value: unknown) {
        setAtPath(config as SparseConfig, [...control.path], value);
    }

    /*
     * The empty string is the `unset` option's own value, and no value the
     * configuration declares is ever empty, so it is unambiguous as the
     * sentinel. `undefined` rather than a delete: the tracker diffs what the
     * live configuration says against its baseline and never looks for a key
     * that has gone, so a deleted key would leave the reader's previous choice
     * standing in the overlay.
     */
    function writeChoice(control: BuilderControl, value: string) {
        write(control, value === '' ? undefined : value);
    }

    /*
     * A field a reader has emptied is a field they are not answering, so it
     * retracts rather than emitting the empty string: neither key this kind
     * covers has one as a value — a locale nobody named is the browser's, and a
     * search for nothing is not a search.
     */
    function writeText(control: BuilderControl, value: string) {
        write(control, value === '' ? undefined : value);
    }

    function pixels(control: BuilderControl): number {
        return parseFloat(String(read(control) ?? '0'));
    }

    /*
     * Where a slider stands, in the unit it runs in rather than the one the
     * configuration takes: a byte budget is dragged in megabytes.
     */
    function slid(control: BuilderControl): number {
        if (control.kind !== 'count') return 0;
        return Number(read(control) ?? 0) / (control.scale ?? 1);
    }

    /*
     * A slider's readout, rounded to the step it can actually land on.
     * `animationTimeConstant` defaults to a seventh of a second, and printing
     * that raw puts sixteen digits in a label a reader is trying to read.
     */
    function counted(control: BuilderControl): string {
        if (control.kind !== 'count') return String(read(control) ?? '');
        const places = Math.max(
            0,
            -Math.floor(Math.log10(control.step) + 1e-9),
        );
        return `${slid(control).toFixed(places)}${control.unit ?? ''}`;
    }

    /*
     * `Name: value` per line, which is the form headers are already written and
     * pasted in. A name the reader has deleted is written back as `undefined`
     * rather than dropped: the tracker records leaves that differ from the
     * baseline and never looks for one that has gone, so a deleted header would
     * otherwise stand in the overlay after it had left the textarea.
     */
    function writeHeaders(control: BuilderControl, text: string) {
        const next: Record<string, string | undefined> = {};
        for (const line of text.split('\n')) {
            const at = line.indexOf(':');
            if (at < 1) continue;
            const name = line.slice(0, at).trim();
            if (name) next[name] = line.slice(at + 1).trim();
        }

        const before = read(control);
        if (isRecord(before)) {
            for (const name of Object.keys(before)) {
                if (!(name in next)) next[name] = undefined;
            }
        }

        write(control, next);
    }

    function headerText(control: BuilderControl): string {
        const value = read(control);
        if (!isRecord(value)) return '';
        return Object.entries(value)
            .filter(([, header]) => header !== undefined)
            .map(([name, header]) => `${name}: ${header}`)
            .join('\n');
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
    }

    function colour(token: TokenControl): string {
        const set = themeOverlay[token.key as keyof ThemeConfig];
        return typeof set === 'string'
            ? set
            : (base.colours[token.name] ?? '#000000');
    }

    /** Where a length or percentage slider stands, in its own unit. */
    function amount(token: TokenControl): number {
        const set = themeOverlay[token.key as keyof ThemeConfig];
        if (typeof set === 'string') return parseFloat(set);
        return token.kind === 'percent'
            ? (base.percents[token.name] ?? 0)
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
        theme = currentTheme();
        themeOverlay = {};
        chosenIds = [];
        declared = {};
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
        </form>

        <div class="bstage__frame">
            <BuilderPreview
                manifestId={currentManifest}
                config={applied}
                plugins={running}
                {theme}
                themeConfig={themeOverlay}
                {colourTokens}
                {lengthTokens}
                {percentTokens}
                onbase={(resolved) => (base = resolved)}
            />
        </div>
    </div>

    <div class="bstage__set">
        <div class="bd__head">
            <button class="btn" type="button" onclick={startOver}>
                Reset to Default
            </button>
        </div>

        <div
            class="bd__tabs"
            role="tablist"
            aria-label="Configuration sections"
            bind:this={tablist}
        >
            {#each TAB_GROUPS as group (group.title)}
                <!-- The group's name divides the row and nothing else: a
                     tablist owns tabs, so this is presentational, and the tabs
                     themselves are named well enough to be read without it. -->
                <span class="bd__group" role="presentation">{group.title}</span>
                {#each group.sections as entry (entry.id)}
                    {@const at = SECTIONS.findIndex(
                        (other) => other.id === entry.id,
                    )}
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
            {/each}
        </div>

        <div class="bd__panes">
            {#if theming && !fixed}
                <fieldset class="bd__from">
                    <legend>Start from a theme</legend>
                    <div class="bd__seg">
                        {#each THEME_CHOICES as choice (choice.value)}
                            <label
                                class="bd__opt"
                                class:on={theme === choice.value}
                            >
                                <input
                                    type="radio"
                                    name="theme-start"
                                    value={choice.value}
                                    checked={theme === choice.value}
                                    onchange={() => (theme = choice.value)}
                                />
                                <span>{choice.label}</span>
                            </label>
                        {/each}
                    </div>
                    <p class="note">
                        Override one or every part of a built-in theme.
                    </p>
                </fieldset>
            {:else if theming}
                <p class="bd__fixed note">
                    Started from {startedFrom}, with your own values over it.
                    <strong>Start over</strong>, above, begins again from any of
                    them.
                </p>
            {/if}

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
                                            writeChoice(
                                                control,
                                                event.currentTarget.value,
                                            )}
                                    >
                                        {#if control.unset}
                                            <option value="">
                                                {control.unset}
                                            </option>
                                        {/if}
                                        {#each control.choices as choice (choice.value)}
                                            <option value={choice.value}>
                                                {choice.label}
                                            </option>
                                        {/each}
                                    </select>
                                </div>
                            {:else if control.kind === 'text'}
                                <div class="row">
                                    <label for={controlId(control)}>
                                        {control.label}
                                    </label>
                                    <input
                                        id={controlId(control)}
                                        type="text"
                                        value={String(read(control) ?? '')}
                                        placeholder={control.placeholder}
                                        oninput={(event) =>
                                            writeText(
                                                control,
                                                event.currentTarget.value,
                                            )}
                                    />
                                </div>
                            {:else if control.kind === 'headers'}
                                <div class="row row--area">
                                    <label for={controlId(control)}>
                                        {control.label}
                                    </label>
                                    <textarea
                                        id={controlId(control)}
                                        rows="3"
                                        spellcheck="false"
                                        value={headerText(control)}
                                        placeholder={control.placeholder}
                                        oninput={(event) =>
                                            writeHeaders(
                                                control,
                                                event.currentTarget.value,
                                            )}
                                    ></textarea>
                                </div>
                            {:else if control.kind === 'colour'}
                                <div class="row">
                                    <label for={controlId(control)}>
                                        {control.label}
                                    </label>
                                    <input
                                        id={controlId(control)}
                                        type="color"
                                        value={String(
                                            read(control) ?? '#000000',
                                        )}
                                        oninput={(event) =>
                                            write(
                                                control,
                                                event.currentTarget.value,
                                            )}
                                    />
                                </div>
                            {:else}
                                <div class="row">
                                    <label for={controlId(control)}>
                                        {control.label}
                                        <span class="row__value">
                                            {control.kind === 'pixels'
                                                ? `${pixels(control)}px`
                                                : counted(control)}
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
                                            : slid(control)}
                                        oninput={(event) =>
                                            write(
                                                control,
                                                control.kind === 'pixels'
                                                    ? `${event.currentTarget.value}px`
                                                    : Number(
                                                          event.currentTarget
                                                              .value,
                                                      ) * (control.scale ?? 1),
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
                    The following are the first-party plugins available today.
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
                        {#if chosenIds.includes(plugin.id)}
                            <div class="plugui">
                                {#each PLUGIN_UI_CONTROLS as control (control.path.join('.'))}
                                    {@const scoped = pluginControl(
                                        plugin,
                                        control,
                                    )}
                                    {#if control.kind === 'toggle'}
                                        <div class="row row--check">
                                            <input
                                                id={controlId(scoped)}
                                                type="checkbox"
                                                checked={readPlugin(scoped) ===
                                                    true}
                                                onchange={(event) =>
                                                    write(
                                                        scoped,
                                                        event.currentTarget
                                                            .checked,
                                                    )}
                                            />
                                            <label for={controlId(scoped)}>
                                                {control.label}
                                            </label>
                                        </div>
                                    {:else if control.kind === 'choice'}
                                        <div class="row">
                                            <label for={controlId(scoped)}>
                                                {control.label}
                                            </label>
                                            <select
                                                id={controlId(scoped)}
                                                value={String(
                                                    read(scoped) ?? '',
                                                )}
                                                onchange={(event) =>
                                                    writeChoice(
                                                        scoped,
                                                        event.currentTarget
                                                            .value,
                                                    )}
                                            >
                                                {#if control.unset}
                                                    <option value="">
                                                        {control.unset}
                                                    </option>
                                                {/if}
                                                {#each control.choices as choice (choice.value)}
                                                    <option
                                                        value={choice.value}
                                                    >
                                                        {choice.label}
                                                    </option>
                                                {/each}
                                            </select>
                                        </div>
                                    {/if}
                                {/each}
                            </div>
                        {/if}
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
                                    {#if token.kind === 'colour'}
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
                                    {:else if token.kind === 'percent'}
                                        <input
                                            id={`tok-${token.key}`}
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={amount(token)}
                                            oninput={(event) =>
                                                setToken(
                                                    token,
                                                    `${event.currentTarget.value}%`,
                                                )}
                                        />
                                    {:else}
                                        <input
                                            id={`tok-${token.key}`}
                                            type="range"
                                            min={token.range?.min ?? 0}
                                            max={token.range?.max ?? 32}
                                            step={token.range?.step ?? 1}
                                            value={amount(token)}
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
            The code blocks below show the current configuration you've set
            above. You can copy them to use in your own project.
        </p>
    </div>

    <div class="hand">
        <section class="hand__one" aria-labelledby="out-config">
            <h3 id="out-config">Portable Viewer Configuration</h3>
            <CopyLine
                text={configText}
                label="configuration object"
                language="js"
            />
        </section>

        <section class="hand__one" aria-labelledby="out-config-theme">
            <h3 id="out-config-theme">Custom Theme</h3>
            <CopyLine
                text={themeText}
                label="theme configuration object"
                language="js"
            />
        </section>

        <section class="hand__one" aria-labelledby="out-link">
            <h3 id="out-link">Share Link</h3>
            <p class="note">
                Send this link for someone else to view your configuration or
                bookmark it for later editing.
            </p>
            <CopyLine text={shareUrl} label="share link" />
        </section>

        <section class="hand__one" aria-labelledby="out-code">
            <h3 id="out-code">Complete Embeddable Code</h3>
            <p class="note">
                The complete code snippet you can embed in your project,
                including the configuration, theme, and any plugins you've
                enabled.
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
