#!/usr/bin/env node
/**
 * Put the Uncial submodule on the branch `.gitmodules` names, and configure git
 * to keep the two repositories in step.
 *
 * Uncial is developed alongside this repository rather than consumed from a
 * release: a change here that needs a change there is one piece of work, and the
 * submodule tracks a branch so the pair can move together until that branch
 * merges. Two things stop that working on their own.
 *
 * A clone checks the submodule out at the recorded commit with no branch, so the
 * first edit lands on a detached HEAD and is lost by the next `submodule update`
 * unless someone notices. And `git push` does not push submodule commits, so the
 * superproject can record a pointer to a commit that exists on one machine only
 * — which fails for everyone else at clone time, long after the mistake.
 *
 * The settings are per-clone and cannot be committed, so they are applied on
 * install. Nothing here rewrites history or moves a branch: the checkout below
 * happens only when the branch already points at the commit being left.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const submodule = 'vendor/uncial';
const path = resolve(repoRoot, submodule);

const git = (args, cwd = repoRoot) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const tryGit = (args, cwd = repoRoot) => {
    try {
        return git(args, cwd);
    } catch {
        return undefined;
    }
};

if (!existsSync(join(path, '.git'))) {
    // Not an error: `pnpm install` runs this, and the workspace already fails
    // outright without the submodule. Say so and leave the exit code alone.
    console.log(
        `setup-submodule: ${submodule} is not checked out; skipping. ` +
            'Run `git submodule update --init --recursive`.',
    );
    process.exit(0);
}

const branch = tryGit([
    'config',
    '--file',
    '.gitmodules',
    `submodule.${submodule}.branch`,
]);

if (!branch) {
    console.log(
        `setup-submodule: .gitmodules names no branch for ${submodule}; skipping.`,
    );
    process.exit(0);
}

/*
 * `on-demand` rather than `check`: a change to Uncial made for this repository
 * is pushed by pushing this repository, which is the flow the submodule exists
 * to support. `check` is the conservative alternative — it refuses the push
 * instead of completing it.
 */
for (const [key, value] of [
    ['push.recurseSubmodules', 'on-demand'],
    ['submodule.recurse', 'true'],
    // So a pointer move reads as the commits it moves over, not as a pair of
    // hashes nobody can evaluate in review.
    ['diff.submodule', 'log'],
    ['status.submodulesummary', '1'],
]) {
    git(['config', key, value]);
}

const head = tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], path);
if (head !== 'HEAD') {
    console.log(`setup-submodule: ${submodule} is on ${head}.`);
    process.exit(0);
}

// Detached. Move onto the declared branch only where that changes no file: the
// branch has to already be at the commit checked out, or at a fast-forward from
// it that the local branch has not diverged from.
const at = git(['rev-parse', 'HEAD'], path);
tryGit(['fetch', 'origin', branch, '--quiet'], path);
const target =
    tryGit(['rev-parse', `refs/remotes/origin/${branch}`], path) ?? at;

if (target !== at) {
    console.log(
        `setup-submodule: ${submodule} is detached at ${at.slice(0, 9)}, and ` +
            `origin/${branch} is at ${target.slice(0, 9)}. Leaving it alone — ` +
            'checking out would change files under you. Resolve by hand.',
    );
    process.exit(0);
}

tryGit(['branch', '--force', branch, at], path);
git(['checkout', branch], path);
tryGit(['branch', `--set-upstream-to=origin/${branch}`, branch], path);
console.log(`setup-submodule: ${submodule} moved onto ${branch}.`);
