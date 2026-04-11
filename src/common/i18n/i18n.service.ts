import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class I18nService {
  private readonly logger = new Logger(I18nService.name);
  private translations: Record<string, Record<string, string>> = {};
  private readonly defaultLang = 'en';

  constructor() {
    this.loadTranslations();
  }

  private loadTranslations() {
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
    } catch (err) {
      this.logger.warn(`Could not load translations from ${localesPath}: ${err.message}`);
    }
  }

  translate(key: string, lang = 'en', placeholders?: Record<string, string>): string {
    const language = lang.split('-')[0].toLowerCase();
    const bundle = this.translations[language] || this.translations[this.defaultLang];
    
    if (!bundle) return key;

    let message = key;

    // Direct lookup (for flat keys like "message_tx.processing.ok")
    if (bundle[key] !== undefined) {
      message = bundle[key];
    } else {
      // Fallback for nested keys if any
      const parts = key.split('.');
      let current: any = bundle;
      for (const part of parts) {
        if (current[part] === undefined) {
          message = key;
          break;
        }
        current = current[part];
      }
      message = typeof current === 'string' ? current : key;
    }

    // Replace placeholders if provided
    if (placeholders && message !== key) {
      Object.entries(placeholders).forEach(([k, v]) => {
        message = message.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }

    return message;
  }
}
