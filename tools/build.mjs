import { cp, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Repository builders need an in-checkout output directory. Generate it through
// the same external, immutable allowlist as manual releases; never copy the repo.
const source = fileURLToPath(new URL('../', import.meta.url));
const output = join(source, 'dist');
if (process.argv.length !== 2) throw new Error('Build takes no arguments; output is always dist.');
try { await mkdir(output); }
catch (error) {
  if (error.code === 'EEXIST') throw new Error('Build output already exists: dist. Move or remove the previous generated output before rebuilding.');
  throw error;
}
let temporary;
let complete = false;
try {
  temporary = await mkdtemp(join(await realpath(tmpdir()), 'profile-cards-build-'));
  const stage = join(temporary, 'repository-build', 'site');
  const result = spawnSync(process.execPath, [join(source, 'tools/stage.mjs'), stage], {
    cwd: source,
    env: { ...process.env, PROFILE_CARDS_RELEASES_DIR: temporary },
    encoding: 'utf8', timeout: 60000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Immutable staging failed.');
  const metadata = JSON.parse(result.stdout);
  for (const name of await readdir(stage)) {
    await cp(join(stage, name), join(output, name), { recursive: true, force: false, errorOnExist: true });
  }
  complete = true;
  console.log(JSON.stringify({ outputDirectory: 'dist', files: metadata.files, assetRevision: metadata.assetRevision }));
} finally {
  // Only paths exclusively created by this invocation may be removed.
  if (temporary) await rm(temporary, { recursive: true, force: true });
  if (!complete) await rm(output, { recursive: true, force: true });
}
