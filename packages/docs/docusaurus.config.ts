import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'TVA Protocol',
  tagline: 'EVM Compatibility on Stellar',
  favicon: 'img/favicon.ico',

  url: 'https://docs.tva-protocol.io',
  baseUrl: '/',

  organizationName: 'tva-protocol',
  projectName: 'tva',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/tva-protocol/tva/tree/main/packages/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/tva-social-card.png',
    navbar: {
      title: 'TVA Protocol',
      logo: {
        alt: 'TVA Protocol Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: '/docs/sdk/getting-started',
          label: 'SDK',
          position: 'left',
        },
        {
          href: '/docs/rpc/overview',
          label: 'RPC API',
          position: 'left',
        },
        {
          href: 'https://github.com/tva-protocol/tva',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
            {
              label: 'Architecture',
              to: '/docs/architecture',
            },
            {
              label: 'SDK Reference',
              to: '/docs/sdk/getting-started',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'https://discord.gg/tva-protocol',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/tva_protocol',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/tva-protocol/tva',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} TVA Protocol. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['solidity', 'rust', 'bash', 'json'],
    },
    algolia: {
      appId: 'YOUR_APP_ID',
      apiKey: 'YOUR_SEARCH_API_KEY',
      indexName: 'tva-protocol',
      contextualSearch: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
