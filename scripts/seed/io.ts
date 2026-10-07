import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { DatasetBundle } from '@bfp/domain';
import { DATASET_PATH } from './constants';

/** Returns the absolute filesystem path used by the local dataset artifact. */
export function getDatasetFilePath() {
  return DATASET_PATH;
}

/** Writes the deterministic dataset artifact to disk using stable JSON formatting. */
export async function writeDatasetBundle(bundle: DatasetBundle) {
  const fileUrl = getDatasetFilePath();
  await mkdir(new URL('..', fileUrl), { recursive: true });
  await writeFile(fileUrl, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
}

/** Reads and parses the dataset artifact from disk. */
export async function readDatasetBundle() {
  const content = await readFile(getDatasetFilePath(), 'utf8');
  return JSON.parse(content) as DatasetBundle;
}
