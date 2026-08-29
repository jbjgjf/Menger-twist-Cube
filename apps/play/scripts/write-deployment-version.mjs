import { writeFile } from 'node:fs/promises';

const deploymentVersion =
  [process.env.VERCEL_GIT_COMMIT_SHA, process.env.GITHUB_SHA]
    .find((value) => value?.trim()) ?? 'local';

await writeFile(
  new URL('../public/deployment-version.txt', import.meta.url),
  `${deploymentVersion}\n`,
  'utf8',
);
