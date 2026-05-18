import * as esbuild from 'esbuild';

async function build() {
  await esbuild.build({
    entryPoints: ['src/headless.js'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'dist/bundled-agent.cjs',
    format: 'cjs',
    external: [
      'systeminformation',
      'socket.io-client',
      'dotenv'
    ],
  });
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
