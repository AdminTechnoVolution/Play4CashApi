"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var I18nService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.I18nService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let I18nService = I18nService_1 = class I18nService {
    logger = new common_1.Logger(I18nService_1.name);
    translations = {};
    defaultLang = 'en';
    constructor() {
        this.loadTranslations();
    }
    loadTranslations() {
        const localesPath = path.join(__dirname, 'locales');
        try {
            const files = fs.readdirSync(localesPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const lang = file.replace('.json', '');
                    const content = fs.readFileSync(path.join(localesPath, file), 'utf8');
                    this.translations[lang] = JSON.parse(content);
                }
            }
            this.logger.log(`Loaded translations for: ${Object.keys(this.translations).join(', ')}`);
        }
        catch (err) {
            this.logger.warn(`Could not load translations from ${localesPath}: ${err.message}`);
        }
    }
    translate(key, lang = 'en', placeholders) {
        const language = lang.split('-')[0].toLowerCase();
        const bundle = this.translations[language] || this.translations[this.defaultLang];
        if (!bundle)
            return key;
        let message = key;
        if (bundle[key] !== undefined) {
            message = bundle[key];
        }
        else {
            const parts = key.split('.');
            let current = bundle;
            for (const part of parts) {
                if (current[part] === undefined) {
                    message = key;
                    break;
                }
                current = current[part];
            }
            message = typeof current === 'string' ? current : key;
        }
        if (placeholders && message !== key) {
            Object.entries(placeholders).forEach(([k, v]) => {
                message = message.replace(new RegExp(`{{${k}}}`, 'g'), v);
            });
        }
        return message;
    }
};
exports.I18nService = I18nService;
exports.I18nService = I18nService = I18nService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], I18nService);
//# sourceMappingURL=i18n.service.js.map