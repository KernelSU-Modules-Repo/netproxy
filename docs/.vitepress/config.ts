import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'NetProxy',
  description: '基于 sing-box 的 Android 透明代理模块',
  lang: 'zh-CN',
  base: '/NetProxy-Magisk/',

  head: [['link', { rel: 'icon', href: '/NetProxy-Magisk/logo.png' }]],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: '指南', link: '/guide/introduction' },
      { text: '配置参考', link: '/config/module' },
      { text: 'GitHub', link: 'https://github.com/Fanju6/NetProxy-Magisk' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '项目介绍', link: '/guide/introduction' },
            { text: '模块理念', link: '/guide/philosophy' },
            { text: '安装与升级', link: '/guide/installation' },
            { text: '快速开始', link: '/guide/quick-start' },
            { text: '6.x 到 7.x 升级', link: '/guide/upgrade-v7' }
          ]
        },
        {
          text: '使用',
          items: [
            { text: 'Android 管理器', link: '/guide/android-manager' },
            { text: 'CLI 使用', link: '/guide/cli' },
            { text: '节点与订阅', link: '/guide/nodes-subscriptions' },
            { text: '透明代理与分应用代理', link: '/guide/transparent-proxy' },
            { text: 'Clash API 与 zashboard', link: '/guide/control-panel' }
          ]
        },
        {
          text: '支持',
          items: [{ text: '常见问题', link: '/guide/faq' }]
        }
      ],
      '/config/': [
        {
          text: '配置参考',
          items: [
            { text: 'module.conf', link: '/config/module' },
            { text: 'sing-box 配置', link: '/config/singbox' },
            { text: 'tproxy.conf', link: '/config/tproxy' },
            { text: '路由与 DNS', link: '/config/routing' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Fanju6/NetProxy-Magisk' }
    ],

    footer: {
      message: '基于 GPL-3.0 许可证发布',
      copyright: 'Copyright © 2024-present Fanju'
    },

    search: {
      provider: 'local'
    },

    outline: {
      label: '页面导航',
      level: [2, 3]
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    lastUpdated: {
      text: '最后更新于'
    },

    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  }
})
