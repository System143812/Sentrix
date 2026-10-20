import * as esbuild from 'esbuild';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

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
      'process.env.AGENT_VERSION': JSON.stringify(pkg.version),
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
