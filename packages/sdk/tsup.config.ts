import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'rpc/index': 'src/rpc/index.ts',
    'compiler/index': 'src/compiler/index.ts',
    'wallet/index': 'src/wallet/index.ts',
    'contract/index': 'src/contract/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@stellar/stellar-sdk',
    'ethers',
  ],
});
