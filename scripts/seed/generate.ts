import { generateDatasetBundle, resolveGenerationCounts } from './generator';
import { getDatasetFilePath, writeDatasetBundle } from './io';

async function main() {
  const scale = process.env.SEED_SCALE ? Number(process.env.SEED_SCALE) : 1;
  const bundle = generateDatasetBundle({ scale });
  await writeDatasetBundle(bundle);

  const counts = resolveGenerationCounts(scale);
  console.log(`Seed written to ${getDatasetFilePath().pathname}`);
  console.log(JSON.stringify(counts, null, 2));
}

await main();
