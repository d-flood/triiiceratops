<script lang="ts">
    import {
        AV_ROWS,
        CAPABILITY_ROWS,
        COMPRESSION,
        COUNTED,
        HEADROOM,
        LAZY_CHUNKS,
        MATRIX_URL,
        MEASURED_ON,
        NO_AV,
        RECIPES,
        SCATTER,
        SESSION_MANIFESTS,
        SIZE_BARS,
        SIZE_ROWS,
        grouped,
        kilobytes,
        reasonText,
    } from '$lib/comparison';
    import { routeAt } from '$lib/routes';

    /**
     * The comparison, in the order the argument runs: the scatter is the whole
     * case in one image, the bars are the half a reader repeats to a colleague,
     * the table is the evidence, and the method says what it is worth.
     *
     * Every figure on this page is computed from the committed comparison data
     * or the recipe catalog — see `$lib/comparison`. Nothing here transcribes a
     * number, which is why there is no drift gate to keep two copies agreeing.
     */
    const route = routeAt('/size/');

    const { plot } = SCATTER;
    const self = CAPABILITY_ROWS.find((row) => row.isSelf);
</script>

{#if route}
    <div class="pagehead">
        <h1>{route.title}</h1>
        <p class="lede">{route.intro}</p>
    </div>
{/if}

<section class="band" aria-labelledby="capability">
    <h2 id="capability">Capability against size</h2>
    <p class="explain">
        The capability axis counts the IIIF Cookbook recipes each viewer is
        recorded as fully supporting in the
        <a href={MATRIX_URL}>official support matrix</a>: {RECIPES.total}
        distinct recipes, {RECIPES.audiovisual} of them audiovisual. Both axes have
        to describe the same viewer, so the size axis is each project's audiovisual
        session.
    </p>

    <!-- The plot is aria-hidden and the table under it carries the same
         figures, so a reader who cannot see the marks reads the numbers
         instead of a list of coordinates. -->
    <div class="scatter">
        <svg
            viewBox="0 0 {SCATTER.width} {SCATTER.height}"
            aria-hidden="true"
            focusable="false"
        >
            {#each SCATTER.yTicks as tick (tick.value)}
                <line
                    class="scatter__grid"
                    x1={plot.left}
                    y1={tick.at}
                    x2={plot.right}
                    y2={tick.at}
                />
                <text class="scatter__tick" x={plot.left - 8} y={tick.at + 4}
                    >{tick.value}</text
                >
            {/each}
            {#each SCATTER.xTicks as tick (tick.value)}
                <text
                    class="scatter__tick scatter__tick--x"
                    x={tick.at}
                    y={plot.bottom + 20}>{tick.value}</text
                >
            {/each}
            <line
                class="scatter__axis"
                x1={plot.left}
                y1={plot.top}
                x2={plot.left}
                y2={plot.bottom}
            />
            <line
                class="scatter__axis"
                x1={plot.left}
                y1={plot.bottom}
                x2={plot.right}
                y2={plot.bottom}
            />
            <text
                class="scatter__axislabel"
                x={(plot.left + plot.right) / 2}
                y={plot.bottom + 46}
                >Cookbook recipes supported, of {RECIPES.total} →</text
            >
            <text
                class="scatter__axislabel"
                x="18"
                y={(plot.top + plot.bottom) / 2}
                transform="rotate(-90 18 {(plot.top + plot.bottom) / 2})"
                >gzip KB ↑</text
            >
            {#each SCATTER.points as point (point.id)}
                <circle
                    class="scatter__point"
                    class:scatter__point--self={point.isSelf}
                    cx={point.x}
                    cy={point.y}
                    r={point.isSelf ? 6 : 5}
                />
                <text
                    class="scatter__label"
                    class:scatter__label--self={point.isSelf}
                    x={point.labelX}
                    y={point.labelY}>{point.name}</text
                >
            {/each}
        </svg>
    </div>
    <p class="figcap">
        Recipe coverage against the gzip bytes of an audiovisual session. Down
        and to the right is better.
    </p>

    <div class="ratios ratios--roman">
        <table>
            <caption class="vh"
                >Recipes supported and audiovisual session size, per viewer</caption
            >
            <thead>
                <tr>
                    <th scope="col">Viewer</th>
                    <th scope="col" class="num">Recipes, of {RECIPES.total}</th>
                    <th scope="col" class="num">Audiovisual session, gzip</th>
                    <th scope="col" class="num">Bytes per recipe</th>
                </tr>
            </thead>
            <tbody>
                {#each CAPABILITY_ROWS as row (row.id)}
                    <tr class:self={row.isSelf}>
                        <th scope="row" class="nm">{row.name}</th>
                        <td class="num"
                            >{row.recipes}{#if row.partial > 0}&nbsp;({row.partial}
                                partial){/if}</td
                        >
                        <td class="num">{grouped(row.gzip)}</td>
                        <td class="num">{grouped(row.bytesPerRecipe)}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
    <p class="explain">
        A viewer with no column in the matrix has no point and no row here. The
        counts proxy specification coverage rather than usefulness: recipes are
        not equally weighted, and the matrix reflects what each project reports
        rather than an independent audit.
    </p>
</section>

<section class="band band--paper" aria-labelledby="size">
    <h2 id="size">Size</h2>
    <div class="chart" aria-hidden="true">
        {#each SIZE_BARS as bar (bar.id)}
            <div class="chart__row">
                <span class="chart__label" class:self={bar.isSelf}
                    >{bar.name}</span
                >
                <span class="chart__value">{kilobytes(bar.gzip)} KB</span>
                <span class="chart__track">
                    <span
                        class="chart__fill"
                        class:self={bar.isSelf}
                        style="width: {bar.widthPercent}%"
                    ></span>
                </span>
            </div>
        {/each}
    </div>
    <p class="figcap">
        gzip transfer size for an image session, in KB of 1000 bytes. Shorter is
        better. The same figures are tabulated below.
    </p>
    <p class="explain">
        Triiiceratops is the smallest of these viewers at all three compression
        levels at once, as a single file with no code splitting. The audiovisual
        pair still beats {HEADROOM.competitor}, the nearest row above it, by
        {grouped(HEADROOM.bytes)} gzip bytes, and the paired size gate fails the build
        if that stops being true.
    </p>
</section>

<section class="band" aria-labelledby="table">
    <h2 id="table">Every figure</h2>
    <div class="ratios ratios--roman">
        <table>
            <caption class="vh"
                >Transfer size of an image session at three compression levels,
                per viewer</caption
            >
            <thead>
                <tr>
                    <th scope="col">Viewer</th>
                    <th scope="col">Version</th>
                    <th scope="col" class="num">Raw</th>
                    <th scope="col" class="num">gzip</th>
                    <th scope="col" class="num">Brotli</th>
                    <th scope="col" class="num">vs. core</th>
                </tr>
            </thead>
            <tbody>
                {#each SIZE_ROWS as row (row.id)}
                    <tr class:self={row.isSelf}>
                        <th scope="row" class="nm">{row.name}</th>
                        <td>{row.version}</td>
                        <td class="num">{grouped(row.raw)}</td>
                        <td class="num">{grouped(row.gzip)}</td>
                        <td class="num">{grouped(row.brotli)}</td>
                        <td class="num"
                            >{row.timesCore === null
                                ? '—'
                                : `${row.timesCore.toFixed(2)}×`}</td
                        >
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</section>

<section class="band band--paper" aria-labelledby="method">
    <h2 id="method">Method</h2>
    <div class="prose">
        <p>
            Measured {MEASURED_ON}. Each viewer's own documented embed was
            served locally and driven in a real browser against the IIIF
            Cookbook manifests
            <a href={SESSION_MANIFESTS.image}>0001-mvm-image</a> and
            <a href={SESSION_MANIFESTS.audiovisual}>0003-mvm-video</a>, and
            every request the page made was recorded. A session is the files
            that session actually fetched, so a viewer that code-splits is
            compared on what it loads rather than on what it publishes.
        </p>
        <p>
            Compression is identical for every row: raw bytes, gzip level {COMPRESSION.gzipLevel},
            Brotli quality {COMPRESSION.brotliQuality}, applied locally, with a
            multi-file total the sum of those files compressed separately, which
            is what separate HTTP responses cost. Triiiceratops is built from
            this repository's own sources and every other row is that project's
            published artifact at the version in the table, not re-minified —
            but no row is produced by a different path from its neighbours.
            Excluded everywhere: source maps, host HTML, manifests, images,
            tiles, media, fonts and external configuration.
        </p>
        <p>
            The versions above and the recipe counts are a dated snapshot of
            projects that move independently. Re-measure before quoting these
            figures: the comparison package rebuilds every row in this page with
            one command, and the page is drawn from its committed output.
        </p>
    </div>
</section>

<div class="band">
    <details class="disclose">
        <summary>
            Audiovisual sessions, exactly what was counted, and what this does
            not tell you
        </summary>

        <h3>Audiovisual sessions</h3>
        <p class="explain">
            Two of these viewers code-split, so a video manifest costs them
            different bytes than an image one. Each figure is the files that
            session fetched.
        </p>
        <div class="ratios ratios--roman">
            <table>
                <caption class="vh"
                    >Image and audiovisual session size, per viewer</caption
                >
                <thead>
                    <tr>
                        <th scope="col">Viewer</th>
                        <th scope="col" class="num">Image session</th>
                        <th scope="col" class="num">Audiovisual session</th>
                        <th scope="col">What the two are made of</th>
                    </tr>
                </thead>
                <tbody>
                    {#each AV_ROWS as row (row.id)}
                        <tr class:self={row.isSelf}>
                            <th scope="row" class="nm">{row.name}</th>
                            <td class="num">{grouped(row.image)}</td>
                            <td class="num">{grouped(row.audiovisual)}</td>
                            <td class="wrap">{row.split}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        <p class="explain">
            gzip bytes. {NO_AV.join(', ')} has no row because it has no audiovisual
            session.
        </p>

        <h3>What our own audiovisual plugin defers</h3>
        <p class="explain">
            These chunks exist beside the plugin and no session above fetches
            one, so none of them is in any figure on this page. Each arrives
            only when a canvas needs it.
        </p>
        <div class="ratios ratios--roman">
            <table>
                <caption class="vh"
                    >Deferred audiovisual chunks and their gzip size</caption
                >
                <thead>
                    <tr>
                        <th scope="col">Chunk</th>
                        <th scope="col" class="num">gzip</th>
                    </tr>
                </thead>
                <tbody>
                    {#each LAZY_CHUNKS as chunk (chunk.name)}
                        <tr>
                            <th scope="row" class="nm">{chunk.name}</th>
                            <td class="num">{grouped(chunk.gzip)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <h3>Exactly what was counted</h3>
        <p class="explain">
            Every file the image session fetched, at the URL it came from. A
            Triiiceratops row is served from this repository's own build output
            instead of a registry, which is the only difference between how its
            figures and everyone else's were produced.
        </p>
        <ul class="counted">
            {#each COUNTED as entry (entry.id)}
                <li>
                    <b>{entry.name}</b>
                    <span class="ver">{entry.version}</span>
                    {#if entry.note}<span class="explain">{entry.note}</span
                        >{/if}
                    <ul>
                        {#each entry.files as file (file.url)}
                            <li>
                                {#if file.external}
                                    <a href={file.url}>{file.name}</a>
                                {:else}
                                    {file.url}
                                {/if}
                                <span class="explain"
                                    >{grouped(file.gzip)} gzip</span
                                >
                            </li>
                        {/each}
                    </ul>
                </li>
            {/each}
        </ul>

        <h3>Recipes counted as partial</h3>
        <p class="explain">
            Core alone supports {RECIPES.core} of {RECIPES.total} recipes; with the
            audiovisual plugin the pair reaches {RECIPES.withPlugin}, which is
            the figure plotted at {self?.recipes}. A recipe counted as partial
            renders while the recipe's own feature does not, and is not counted
            as supported:
        </p>
        <ul class="prose">
            {#each RECIPES.partial as recipe (recipe.id)}
                <li>{recipe.id} — {reasonText(recipe.reason ?? '')}</li>
            {/each}
        </ul>

        <h3>What this does not tell you</h3>
        <ul class="prose">
            <li>
                Transfer size only — not parsed size, memory, startup time, or
                the IIIF content a viewer then fetches.
            </li>
            <li>
                Feature sets and packaging differ. Triiiceratops compiles all of
                its core locales into the element; some of these viewers keep
                translations in external JSON.
            </li>
            <li>
                A session is one manifest's worth of behaviour, not a site's. A
                collection mixing image and time-based canvases moves the rows
                that code-split.
            </li>
            <li>
                CDN compression can differ from these deterministic local
                settings.
            </li>
        </ul>
    </details>
</div>
