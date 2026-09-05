import { describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import { COOKBOOK_RECIPES } from '@triiiceratops/cookbook';

import RecipeBrowser from './RecipeBrowser.svelte';
import { groupRecipes } from './manifestCatalog';

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
                support: 'partial',
                requiresPluginAv: true,
                matrixSupport: false,
                reason: 'the video renders full-rect',
            },
        ]);

        expect(entries[0].label).toBe('0489 Multimedia Canvas');
        expect(entries[0].support).toBe('partial');
    });
});

describe('RecipeBrowser', () => {
    it('renders a heading per group and loads a manifest on click', () => {
        const target = document.createElement('div');
        document.body.append(target);
        const loaded: string[] = [];

        const component = mount(RecipeBrowser, {
            target,
            props: { onSelect: (url: string) => loaded.push(url) },
        });

        const headings = target.querySelectorAll('.section-heading');
        expect(headings.length).toBe(groupRecipes().length + 3);

        const entries =
            target.querySelectorAll<HTMLButtonElement>('button.entry');
        expect(entries.length).toBeGreaterThan(COOKBOOK_RECIPES.length);
        entries[0].click();
        expect(loaded).toEqual([COOKBOOK_RECIPES[0].manifestUrl]);

        unmount(component);
        target.remove();
    });

    it('shows the status and reason of a recipe that is not fully supported', () => {
        const target = document.createElement('div');
        document.body.append(target);

        const component = mount(RecipeBrowser, {
            target,
            props: { onSelect: () => {} },
        });

        const partial = COOKBOOK_RECIPES.find((r) => r.support !== 'supported');
        expect(partial).toBeDefined();
        const statuses = [...target.querySelectorAll('.entry-status')].map(
            (el) => el.textContent,
        );
        expect(statuses.some((text) => text?.includes(partial!.reason!))).toBe(
            true,
        );

        unmount(component);
        target.remove();
    });
});
