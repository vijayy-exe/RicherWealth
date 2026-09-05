import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

/**
 * Real Resend integration — but this dev environment has no RESEND_API_KEY
 * configured (confirmed: not in .env/.env.example before this phase), so
 * every send here will log a clear warning and return false rather than
 * fake success. Same honesty pattern as FRED/NewsAPI/GNews elsewhere in
 * this app when a key is missing.
 */
@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);
  private readonly client: Resend | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    this.client = apiKey ? new Resend(apiKey) : null;
    this.fromAddress = this.config.get<string>("RESEND_FROM_ADDRESS") ?? "alerts@richerwealth.app";
    if (!this.client) {
      this.logger.warn("RESEND_API_KEY not configured — email notifications will be skipped, not faked.");
    }
  }

  /** Returns true only if Resend actually accepted the send. */
  async send(to: string, subject: string, body: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { error } = await this.client.emails.send({
        from: this.fromAddress,
        to,
        subject,
        text: body,
      });
      if (error) {
        this.logger.warn(`Resend rejected email to ${to}: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Email send failed: ${String(err)}`);
      return false;
    }
  }
}
