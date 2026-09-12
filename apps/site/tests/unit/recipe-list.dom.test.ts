/**
 * The recipe catalog: how the Cookbook's recipes are grouped, and that the list
 * built from them offers every one of them with the catalog's own verdict.
 */

import { describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import { COOKBOOK_RECIPES } from '@triiiceratops/cookbook';

import RecipeList from '$lib/recipes/RecipeList.svelte';
import { groupRecipes } from '$lib/recipes/manifestCatalog';

describe('groupRecipes', () => {
    it('groups every catalog recipe, in the order the groups first appear', () => {
        const sections = groupRecipes();
        const firstSeen: string[] = [];
        for (const recipe of COOKBOOK_RECIPES) {
            if (!firstSeen.includes(recipe.group)) firstSeen.push(recipe.group);
        }

        expect(sections.map((s) => s.key)).toEqual(firstSeen);
        expect(sections.flatMap((s) => s.entries)).toHaveLength(
            COOKBOOK_RECIPES.length,
        );
    });

    it('labels an entry with its recipe number and name', () => {
        const [{ entries }] = groupRecipes([
            {
                id: '0489-multimedia-canvas',
                name: 'Multimedia Canvas',
                manifestUrl: 'https://example.org/manifest.json',
                group: 'audiovisual',
                support: 'unsupported',
                requiresPluginAv: true,
                matrixSupport: false,
                reason: 'the video renders full-rect',
            },
        ]);

        expect(entries[0].label).toBe('0489 Multimedia Canvas');
        expect(entries[0].support).toBe('unsupported');
    });
});

describe('RecipeList', () => {
    it('renders a heading per group and loads a manifest on click', () => {
        const target = document.createElement('div');
        document.body.append(target);
        const loaded: string[] = [];

        const component = mount(RecipeList, {
            target,
            props: { onSelect: (url: string) => loaded.push(url) },
        });

        // The catalog's groups, plus the three the catalog has no entry for.
        const headings = target.querySelectorAll('.recstage__head');
        expect(headings.length).toBe(groupRecipes().length + 3);

        const entries = target.querySelectorAll<HTMLButtonElement>(
            'button.recstage__opt',
        );
        expect(entries.length).toBeGreaterThan(COOKBOOK_RECIPES.length);
        entries[0].click();
        expect(loaded).toEqual([COOKBOOK_RECIPES[0].manifestUrl]);

        unmount(component);
        target.remove();
    });

    it('shows the reason an unsupported recipe is unsupported', () => {
        const target = document.createElement('div');
        document.body.append(target);

        const component = mount(RecipeList, {
            target,
            props: { onSelect: () => {} },
        });

        const unsupported = COOKBOOK_RECIPES.find(
            (r) => r.support !== 'supported',
        );
        expect(unsupported).toBeDefined();
        const statuses = [...target.querySelectorAll('.recstage__say')].map(
            (el) => el.textContent,
        );
        expect(
            statuses.some((text) => text?.includes(unsupported!.reason!)),
        ).toBe(true);

        unmount(component);
        target.remove();
    });

    /*
     * A manifest with no catalog entry is not a recipe with no verdict: the
     * institutional and vendored manifests are here to be looked at, and
     * printing a status for them would credit or blame the viewer for a claim
     * nothing makes.
     */
    it('says nothing about a manifest the catalog does not list', () => {
        const target = document.createElement('div');
        document.body.append(target);

        const component = mount(RecipeList, {
            target,
            props: { onSelect: () => {} },
        });

        const rows = [
            ...target.querySelectorAll<HTMLButtonElement>(
                'button.recstage__opt',
            ),
        ];
        const institutional = rows.find((row) =>
            row.textContent?.includes('Wellcome Collection'),
        );
        expect(institutional).toBeDefined();
        expect(institutional!.querySelector('.recstage__say')).toBeNull();

        unmount(component);
        target.remove();
    });
});
