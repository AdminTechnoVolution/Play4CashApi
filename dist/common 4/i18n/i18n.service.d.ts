export declare class I18nService {
    private readonly logger;
    private translations;
    private readonly defaultLang;
    constructor();
    private loadTranslations;
    translate(key: string, lang?: string, placeholders?: Record<string, string>): string;
}
