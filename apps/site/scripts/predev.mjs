import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

for (const script of ['gen:icons', 'gen:state', 'gen:styles']) {
    execFileSync('pnpm', ['--filter', 'triiiceratops', script], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
    });
}
