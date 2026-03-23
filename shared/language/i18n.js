const i18n = require('i18n');
const path = require('path');

i18n.configure({
    locales: ['en', 'es', 'fr', 'it', 'pt', 'de'],
    defaultLocale: 'es',
    fallbacks: { 'en': 'es', 'fr': 'es', 'it': 'es', 'pt': 'es', 'de': 'es' },
    directory: path.join(__dirname, 'locales'),
    objectNotation: false,
    autoReload: true,
    updateFiles: false,
    syncFiles: false,
    cookie: 'lang'
});

module.exports = i18n;
