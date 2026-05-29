import * as esbuild from 'esbuild';

async function build() {
  await esbuild.build({
    entryPoints: ['src/headless.js', 'src/helper.js'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outdir: 'dist',
    entryNames: '[name]',
    format: 'cjs',
    define: {
      'import.meta.url': 'undefined',
    },
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
