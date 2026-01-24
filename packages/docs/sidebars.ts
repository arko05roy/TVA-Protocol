import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Introduction',
      items: [
        'getting-started',
        'architecture',
        'concepts',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/solidity-on-soroban',
        'guides/hardhat-setup',
        'guides/metamask-setup',
        'guides/deploying-contracts',
        'guides/contract-interaction',
      ],
    },
    {
      type: 'category',
      label: 'SDK Reference',
      items: [
        'sdk/getting-started',
        'sdk/rpc-client',
        'sdk/wallet',
        'sdk/contract',
        'sdk/compiler',
      ],
    },
    {
      type: 'category',
      label: 'RPC API',
      items: [
        'rpc/overview',
        'rpc/eth-methods',
        'rpc/net-methods',
        'rpc/web3-methods',
      ],
    },
    {
      type: 'category',
      label: 'Ethers.js Adapter',
      items: [
        'ethers/getting-started',
        'ethers/provider',
        'ethers/signer',
      ],
    },
    {
      type: 'category',
      label: 'Hardhat Plugin',
      items: [
        'hardhat/installation',
        'hardhat/compilation',
        'hardhat/deployment',
        'hardhat/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: [
        'advanced/ttl-management',
        'advanced/storage-types',
        'advanced/gas-estimation',
        'advanced/security',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/compiler-constraints',
        'reference/error-codes',
        'reference/chain-id',
      ],
    },
  ],
};

export default sidebars;
