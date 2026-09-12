<script lang="ts">
    /**
     * One figure and one table. The figure carries the whole argument — recipe
     * coverage as filled area, session size as bar length, per viewer — and the
     * table is its evidence; the byte-exact breakdowns sit in the disclosure
     * under it.
     *
     * Every figure here is computed from a committed data source: the browser
     * measurement, the Cookbook support matrix, and the recipe catalog. See
     * `$lib/comparison`. Nothing on this page transcribes a number, which is
     * why there is no drift gate keeping two copies of one figure agreeing.
     */
    import PageHead from '$lib/PageHead.svelte';
    import {
        BUNDLES,
        COMPRESSION,
        COVERAGE,
        MEASURED_ON,
        RANKED,
        SESSION_MANIFESTS,
        grouped,
        kilobytes,
    } from '$lib/comparison';
</script>

<PageHead />

<section class="band" aria-labelledby="coverage">
    <h2 id="coverage">Coverage against size</h2>
    <p class="explain">
        To put an objective (if imperfect) measurement on the capability of the
        following IIIF viewers, we count the number of recipes each viewer is
        recorded as supporting in the
        <a href="https://iiif.io/api/cookbook/recipe/matrix/"
            >IIIF Cookbook Viewer Matrix</a
        >. At the time of measurement, there were {COVERAGE.total} recipes on that
        matrix.
    </p>

    <!-- Two figures, one per axis, over the same viewers in the same order:
         each encoding gets the whole width, and a reader compares a row's
         position between them. Both are aria-hidden and the table below
         carries every figure, so a reader who cannot see them reads the counts
         rather than several hundred cell states read aloud. -->
    <h3 class="figtitle">
        Supported recipes <span class="figtitle__hint">more is better</span>
    </h3>
    <div class="cov" aria-hidden="true">
        {#each COVERAGE.rows as row (row.id)}
            <div class="cov__row" class:self={row.isSelf}>
                <span class="cov__name">{row.name}</span>
                <span class="cov__cells">
                    {#each row.cells as cell, at (at)}
                        <span class="cov__cell cov__cell--{cell}"></span>
                    {/each}
                </span>
                <span class="cov__value"
                    >{row.recipes}{#if row.partial > 0}<span class="cov__plus"
                            >+{row.partial}</span
                        >{/if}</span
                >
            </div>
        {/each}
    </div>
    <ul class="cov__key">
        <li><span class="cov__cell cov__cell--on"></span> works</li>
        <li>
            <span class="cov__cell cov__cell--partial"></span> partial, as the matrix
            marks it
        </li>
        <li><span class="cov__cell cov__cell--off"></span> does not</li>
        <li>of {COVERAGE.total} recipes</li>
    </ul>

    <h3 class="figtitle">
        Bundle size <span class="figtitle__hint">less is better</span>
    </h3>
    <div class="cov" aria-hidden="true">
        {#each BUNDLES as row (row.id)}
            <div class="cov__row" class:self={row.isSelf}>
                <span class="cov__name">{row.name}</span>
                <span class="cov__size">
                    <span class="cov__track">
                        <span
                            class="cov__fill"
                            style="width: {row.sizePercent}%"
                        ></span>
                    </span>
                </span>
                <span class="cov__value">{kilobytes(row.gzip)} KB</span>
            </div>
        {/each}
    </div>

    <p class="figcap">
        The bundle size of each viewer, gzipped, for an audio/visual session.
        That distinction is important because Universal Viewer, for example,
        uses code splitting to dynamically load support for audiovisual content.
        This can make it appear smaller than Mirador, but Mirador is a single
        bundle. The figures above are the real gzipped sizes delivered over the
        wire for an audiovisual session.
    </p>
</section>

<section class="band band--paper" aria-labelledby="table">
    <h2 id="table">Every viewer measured</h2>
    <div class="ratios ratios--roman">
        <table>
            <caption class="vh"
                >Recipe coverage and session size, per viewer, smallest session
                first</caption
            >
            <thead>
                <tr>
                    <th scope="col">Viewer</th>
                    <th scope="col">Version</th>
                    <th scope="col" class="num">Recipes, of {COVERAGE.total}</th
                    >
                    <th scope="col" class="num">Image session</th>
                    <th scope="col" class="num">Audiovisual session</th>
                    <th scope="col" class="num">Bytes per recipe</th>
                </tr>
            </thead>
            <tbody>
                {#each RANKED as row (row.id)}
                    <tr class:self={row.isSelf}>
                        <th scope="row" class="nm">{row.name}</th>
                        <td>{row.version}</td>
                        <td class="num"
                            >{row.recipes === null
                                ? '—'
                                : row.recipes}{#if row.partial > 0}&nbsp;({row.partial}
                                partial){/if}</td
                        >
                        <td class="num">{grouped(row.image)}</td>
                        <td class="num"
                            >{row.audiovisual === null
                                ? '—'
                                : grouped(row.audiovisual)}</td
                        >
                        <td class="num"
                            >{row.bytesPerRecipe === null
                                ? '—'
                                : grouped(row.bytesPerRecipe)}</td
                        >
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</section>

<section class="band" aria-labelledby="method">
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
            published artifact at the version in the table, not re-minified.
            Excluded everywhere: source maps, host HTML, manifests, images,
            tiles, media, fonts and external configuration.
        </p>
    </div>
</section>
