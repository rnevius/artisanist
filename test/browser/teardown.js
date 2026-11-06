import { rmSync } from 'node:fs';
import { basename } from 'node:path';

export default function teardown() {
  const directory = process.env.ARTISANIST_E2E_DIR;
  if (directory && basename(directory).startsWith('artisanist-e2e-'))
    rmSync(directory, { recursive: true, force: true });
}
