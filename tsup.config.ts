import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts', cli: 'src/cli.ts', mcp: 'src/mcp/server.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'node18',
    external: ['better-sqlite3'],
    noExternal: [],
    splitting: false,
    sourcemap: true,
    treeshake: true,
  }
])
