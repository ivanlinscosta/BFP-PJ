import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist/lambda', { recursive: true });

await build({
  entryPoints: ['src/http/lambda.ts'],
  outfile: 'dist/lambda/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: ['@aws-sdk/*'],
});

// The workspace root declares "type": "module", which would make Node treat
// this CommonJS bundle as ESM. Pin the bundle scope back to CommonJS so the
// Lambda entrypoint resolves `exports.handler` locally and on the runtime.
await writeFile('dist/lambda/package.json', `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
