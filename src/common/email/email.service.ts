import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: this.config.get<string>('email.service'),
      auth: {
        user: this.config.get<string>('email.from'),
        pass: this.config.get<string>('email.pass'),
      },
    });

    this.transporter.verify((error) => {
      if (error) {
        this.logger.error(`Email transport configuration error: ${error}`);
      } else {
        this.logger.log('Email Transport Server is ready');
      }
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const from = this.config.get<string>('email.from');
    const mailOptions = {
      from: `"Play4Cash" <${from}>`,
      to,
      subject,
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
      // In production, we might want to re-throw or handle this
    }
  }

  async sendWithdrawalVerification(
    to: string,
    username: string,
    code: string,
    expiryMins: number,
    lang = 'en',
  ): Promise<void> {
    const translations: Record<string, { subject: string; body: string }> = {
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
}
