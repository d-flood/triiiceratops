import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

for (const script of [
    'gen:icons',
    'gen:state',
    'gen:paraglide',
    'gen:styles',
]) {
    // The light-DOM sheet is a scoped production artifact, so style edits need
    // this predev step rerun rather than being served unscoped through HMR.
    execFileSync('pnpm', ['--filter', 'triiiceratops', script], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
    });
}
