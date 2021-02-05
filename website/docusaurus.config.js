module.exports = {
  title: 'Optic',
  tagline: 'Optic documents your APIs as you build them',
  url: 'https://useoptic.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'throw',
  favicon: 'img/favicon.ico',
  organizationName: 'opticdev', // Usually your GitHub org/user name.
  projectName: 'optic', // Usually your repo name.
  themeConfig: {
    googleAnalytics: {
      trackingID: 'G-Y7T04R4QF5',
    },
    hideableSidebar: true,
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
    },
    announcementBar: {
      id: 'optic9', // Any value that will identify this message.
      content:
        '<b>🚀 Optic 9 released! </b> Rust Diff engine is 1000x faster, redesigned UI makes working with large APIs easy.  <a rel="noopener noreferrer" href="/docs">Try it today</a>',
      backgroundColor: '#091E42', // Defaults to `#fff`.
      textColor: '#fff', // Defaults to `#000`.
      isCloseable: true, // Defaults to `true`.
    },
    navbar: {
      title: 'Optic',
      logo: {
        alt: 'Optic logo',
        src: 'img/optic-logo.png',
        srcDark: 'img/optic-logo-dark.png',
      },
      items: [
        {
          to: 'docs/',
          activeBasePath: 'docs',
          label: 'Docs',
          position: 'left',
        },
        {
          to: 'docs/community/',
          activeBasePath: 'docs/community',
          label: 'Community',
          position: 'left',
        },
        { to: 'blog', label: 'Blog', position: 'left' },
        {
          href: 'https://github.com/opticdev/optic',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Community',
          items: [
            {
              label: 'Join Community',
              href: '/docs/community',
            },
            {
              label: 'Discord',
              href: 'https://discord.gg/t9hADkuYjP',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/@useoptic',
            },
            {
              label: 'GitHub Discussion',
              href: 'https://github.com/opticdev/optic/discussions',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: 'blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/opticdev/optic',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Optic Labs`,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl: 'https://github.com/opticdev/optic/edit/develop/website/',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl:
            'https://github.com/opticdev/optic/edit/develop/website/blog/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  stylesheets: [
    'https://fonts.googleapis.com/css?family=Inter:200,400,600,700',
    'https://fonts.googleapis.com/css?family=Ubuntu+Mono:200,400,600,700',
  ],
};
