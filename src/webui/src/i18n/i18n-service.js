import zhCN from './zh-CN.js';
import enUS from './en-US.js';
import urPK from './ur-PK.js';

/**
 * I18nService - Internationalization Service
 * Handles language switching, translation lookup, and persistence.
 */
export class I18nService {
    static STORAGE_KEY = 'language';
    static DEFAULT_LANG = 'zh-CN'; // Default fallback
    static currentLang = 'zh-CN';

    // Translation Resources
    static resources = {
        'zh-CN': zhCN,
        'en-US': enUS,
        'ur-PK': urPK
    };

    // Initialize
    static init() {
        const savedLang = localStorage.getItem(this.STORAGE_KEY);
        if (savedLang && this.resources[savedLang]) {
            this.currentLang = savedLang;
        } else {
            // Auto detect
            const navLang = navigator.language;
            if (navLang.startsWith('en')) {
                this.currentLang = 'en-US';
            } else {
                this.currentLang = 'zh-CN'; // Default to Chinese
            }
        }
        document.documentElement.lang = this.currentLang;
        this.applyLanguage();
    }

    // Set Language
    static setLanguage(lang) {
        if (lang === 'auto') {
            localStorage.removeItem(this.STORAGE_KEY);
            this.init(); // Re-detect
        } else if (this.resources[lang]) {
            this.currentLang = lang;
            localStorage.setItem(this.STORAGE_KEY, lang);
            document.documentElement.lang = lang;
            this.applyLanguage();
        }
    }

    static getLanguage() {
        return localStorage.getItem(this.STORAGE_KEY) || 'auto';
    }

    // Translate
    static t(key, params = {}) {
        const dict = this.resources[this.currentLang] || this.resources[this.DEFAULT_LANG];
        let text = dict[key] || key;

        // Replace params: {name} -> value
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
        return text;
    }

    // Apply translation to all [data-i18n] elements
    static applyLanguage() {
        // Set directionality
        if (this.currentLang === 'ur-PK') {
            document.documentElement.dir = 'rtl';
        } else {
            document.documentElement.dir = 'ltr';
        }

        const selectors = [
            '[data-i18n]',
            '[data-i18n-placeholder]',
            '[data-i18n-label]',
            '[data-i18n-headline]',
            '[data-i18n-helper]',
            '[data-i18n-description]'
        ];
        const elements = document.querySelectorAll(selectors.join(','));

        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = this.t(key);
            }

            const attrs = ['placeholder', 'label', 'headline', 'helper', 'description'];
            attrs.forEach(attr => {
                const k = el.getAttribute(`data-i18n-${attr}`);
                if (k) el.setAttribute(attr, this.t(k));
            });
        });

        // Dispatch event for components to update themselves
        window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: this.currentLang } }));
    }
}
