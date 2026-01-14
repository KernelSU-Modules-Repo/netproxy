import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'NetProxy',
    description: 'Android 透明代理 Magisk/KernelSU 模块',
    lang: 'zh-CN',

    // GitHub Pages 部署配置
    base: '/NetProxy/',

    head: [
        ['link', { rel: 'icon', href: '/NetProxy/favicon.ico' }]
    ],

    themeConfig: {
        logo: '/logo.png',

        nav: [
            { text: '指南', link: '/guide/introduction' },
            { text: '配置', link: '/config/module' },
            { text: 'WebUI', link: '/webui/overview' },
            { text: 'GitHub', link: 'https://github.com/Fanju6/NetProxy-Magisk' }
        ],

        sidebar: {
            '/guide/': [
                {
                    text: '入门',
                    items: [
                        { text: '项目介绍', link: '/guide/introduction' },
                        { text: '安装教程', link: '/guide/installation' },
                        { text: '快速开始', link: '/guide/quick-start' }
                    ]
                },
                {
                    text: '进阶',
                    items: [
                        { text: '常见问题', link: '/guide/faq' }
                    ]
                }
            ],
            '/config/': [
                {
                    text: '配置说明',
                    items: [
                        { text: '模块配置', link: '/config/module' },
                        { text: 'Xray 配置', link: '/config/xray' },
                        { text: '路由规则', link: '/config/routing' }
                    ]
                }
            ],
            '/webui/': [
                {
                    text: 'WebUI',
                    items: [
                        { text: '功能概览', link: '/webui/overview' },
                        { text: '功能详情', link: '/webui/features' }
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
