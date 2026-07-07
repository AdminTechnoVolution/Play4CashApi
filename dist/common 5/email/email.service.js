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
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let EmailService = EmailService_1 = class EmailService {
    config;
    logger = new common_1.Logger(EmailService_1.name);
    transporter;
    constructor(config) {
        this.config = config;
        this.transporter = nodemailer.createTransport({
            service: this.config.get('email.service'),
            auth: {
                user: this.config.get('email.from'),
                pass: this.config.get('email.pass'),
            },
        });
        this.transporter.verify((error) => {
            if (error) {
                this.logger.error(`Email transport configuration error: ${error}`);
            }
            else {
                this.logger.log('Email Transport Server is ready');
            }
        });
    }
    async sendEmail(to, subject, html) {
        const from = this.config.get('email.from');
        const mailOptions = {
            from: `"Play4Cash" <${from}>`,
            to,
            subject,
            html,
        };
        try {
            await this.transporter.sendMail(mailOptions);
            this.logger.log(`Email sent to ${to}`);
        }
        catch (error) {
            this.logger.error(`Failed to send email to ${to}: ${error}`);
        }
    }
    async sendWithdrawalVerification(to, username, code, expiryMins, lang = 'en') {
        const translations = {
            en: {
                subject: 'Play4Cash - Withdrawal Verification',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Withdrawal request at Play4Cash</h2>
            <p>Hello <strong>${username}</strong></p>
            <p>We received your request to make a withdrawal. To proceed, please use the following verification code:</p>
            <h3>${code}</h3>
            <p>The verification code will be valid for ${expiryMins} minutes. Please do not share this code with anyone</p>
            <p style='font-size: 12px; color: #F7D774;'>This is an automated message. If you did not request this, please ignore it and do not reply.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Play4Cash Team</p>
          </div>
        `,
            },
            es: {
                subject: 'Play4Cash - Verificación de Retiro',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Solicitud de retiro en Play4Cash</h2>
            <p>Hola <strong>${username}</strong></p>
            <p>Recibimos tu solicitud para realizar un retiro. Para continuar, por favor utiliza el siguiente código de verificación:</p>
            <h3>${code}</h3>
            <p>El código de verificación será válido por ${expiryMins} minutos. Por favor no compartas este código con nadie</p>
            <p style='font-size: 12px; color: #F7D774;'>Este es un mensaje automático. Si no lo solicitaste, por favor ignóralo y no respondas.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Equipo de Play4Cash</p>
          </div>
        `,
            },
            de: {
                subject: 'Play4Cash - Bestätigung der Abhebung',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Auszahlungsanfrage bei Play4Cash</h2>
            <p>Hallo <strong>${username}</strong></p>
            <p>Wir haben Ihre Anfrage erhalten, eine Auszahlung vorzunehmen. Um fortzufahren, verwenden Sie bitte den folgenden Verifizierungscode:</p>
            <h3>${code}</h3>
            <p>Der Verifizierungscode ist ${expiryMins} Minuten lang gültig. Bitte teilen Sie diesen Code niemandem mit</p>
            <p style='font-size: 12px; color: #F7D774;'>Dies ist eine automatische Nachricht. Wenn Sie dies nicht angefordert haben, ignorieren Sie sie bitte und antworten Sie nicht.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Play4Cash Team</p>
          </div>
        `,
            },
            fr: {
                subject: 'Play4Cash - Vérification du retrait',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Demande de retrait sur Play4Cash</h2>
            <p>Bonjour <strong>${username}</strong></p>
            <p>Nous avons reçu votre demande pour effectuer un retrait. Pour continuer, veuillez utiliser le code de vérification suivant :</p>
            <h3>${code}</h3>
            <p>Le code de vérification sera valide pendant ${expiryMins} minutes. Veuillez ne partager ce code avec personne</p>
            <p style='font-size: 12px; color: #F7D774;'>Ceci est un message automatisé. Si vous ne l'avez pas demandé, veuillez l'ignorer et ne pas répondre.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>L'équipe Play4Cash</p>
          </div>
        `,
            },
            it: {
                subject: 'Play4Cash - Verifica del prelievo',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Richiesta di prelievo su Play4Cash</h2>
            <p>Ciao <strong>${username}</strong></p>
            <p>Abbiamo ricevuto la tua richiesta di effettuare un prelievo. Per procedere, utilizza il seguente codice di verifica:</p>
            <h3>${code}</h3>
            <p>Il codice di verifica sarà valido per ${expiryMins} minuti. Ti preghiamo di non condividere questo codice con nessuno</p>
            <p style='font-size: 12px; color: #F7D774;'>Questo è un messaggio automatico. Se non lo hai richiesto, ignoralo e non rispondere.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Play4Cash Team</p>
          </div>
        `,
            },
            pt: {
                subject: 'Play4Cash - Verificação de saque',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Solicitação de saque no Play4Cash</h2>
            <p>Olá <strong>${username}</strong></p>
            <p>Recebemos sua solicitação para realizar um saque. Para continuar, use o seguinte código de verificação:</p>
            <h3>${code}</h3>
            <p>O código de verificação será válido por ${expiryMins} minutos. Por favor, não compartilhe este código com ninguém</p>
            <p style='font-size: 12px; color: #F7D774;'>Esta é uma mensagem automática. Se você não solicitou isso, ignore-a e não responda.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Equipe Play4Cash</p>
          </div>
        `,
            },
        };
        const t = translations[lang] || translations['en'];
        await this.sendEmail(to, t.subject, t.body);
    }
    async sendWalletChangeVerification(to, username, code, expiryMins, lang = 'en') {
        const translations = {
            en: {
                subject: 'Play4Cash - Wallet update verification',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Wallet address update at Play4Cash</h2>
            <p>Hello <strong>${username}</strong></p>
            <p>You requested to update your withdrawal wallet address. Use this verification code to confirm:</p>
            <h3>${code}</h3>
            <p>The code is valid for ${expiryMins} minutes. Do not share it with anyone.</p>
            <p style='font-size: 12px; color: #F7D774;'>If you did not request this change, ignore this email.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Play4Cash Team</p>
          </div>
        `,
            },
            es: {
                subject: 'Play4Cash - Verificación de cambio de billetera',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Actualización de billetera en Play4Cash</h2>
            <p>Hola <strong>${username}</strong></p>
            <p>Solicitaste actualizar tu dirección de billetera para retiros. Usa este código para confirmar:</p>
            <h3>${code}</h3>
            <p>El código es válido por ${expiryMins} minutos. No lo compartas con nadie.</p>
            <p style='font-size: 12px; color: #F7D774;'>Si no solicitaste este cambio, ignora este correo.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Equipo Play4Cash</p>
          </div>
        `,
            },
            de: {
                subject: 'Play4Cash - Wallet-Update-Verifizierung',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Wallet-Adresse bei Play4Cash aktualisieren</h2>
            <p>Hallo <strong>${username}</strong></p>
            <p>Sie haben die Aktualisierung Ihrer Auszahlungs-Wallet-Adresse angefordert. Bestätigen Sie mit diesem Code:</p>
            <h3>${code}</h3>
            <p>Der Code ist ${expiryMins} Minuten gültig. Teilen Sie ihn mit niemandem.</p>
            <p style='font-size: 12px; color: #F7D774;'>Wenn Sie diese Änderung nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Play4Cash Team</p>
          </div>
        `,
            },
            fr: {
                subject: 'Play4Cash - Vérification du changement de portefeuille',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Mise à jour du portefeuille sur Play4Cash</h2>
            <p>Bonjour <strong>${username}</strong></p>
            <p>Vous avez demandé de mettre à jour l'adresse de votre portefeuille pour les retraits. Utilisez ce code pour confirmer :</p>
            <h3>${code}</h3>
            <p>Le code est valide ${expiryMins} minutes. Ne le partagez avec personne.</p>
            <p style='font-size: 12px; color: #F7D774;'>Si vous n'avez pas demandé ce changement, ignorez cet e-mail.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>L'équipe Play4Cash</p>
          </div>
        `,
            },
            it: {
                subject: 'Play4Cash - Verifica aggiornamento portafoglio',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Aggiornamento portafoglio su Play4Cash</h2>
            <p>Ciao <strong>${username}</strong></p>
            <p>Hai richiesto di aggiornare l'indirizzo del portafoglio per i prelievi. Usa questo codice per confermare:</p>
            <h3>${code}</h3>
            <p>Il codice è valido per ${expiryMins} minuti. Non condividerlo con nessuno.</p>
            <p style='font-size: 12px; color: #F7D774;'>Se non hai richiesto questa modifica, ignora questa email.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Team Play4Cash</p>
          </div>
        `,
            },
            pt: {
                subject: 'Play4Cash - Verificação de atualização da carteira',
                body: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;'>
            <h2 style='color: #D4AF37;'>Atualização de carteira no Play4Cash</h2>
            <p>Olá <strong>${username}</strong></p>
            <p>Você solicitou atualizar o endereço da carteira para saques. Use este código para confirmar:</p>
            <h3>${code}</h3>
            <p>O código é válido por ${expiryMins} minutos. Não compartilhe com ninguém.</p>
            <p style='font-size: 12px; color: #F7D774;'>Se você não solicitou esta alteração, ignore este e-mail.</p>
            <hr style='margin: 30px 0;'>
            <p style='font-size: 12px; color: #F7D774;'>Equipe Play4Cash</p>
          </div>
        `,
            },
        };
        const t = translations[lang] || translations['en'];
        await this.sendEmail(to, t.subject, t.body);
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailService);
//# sourceMappingURL=email.service.js.map