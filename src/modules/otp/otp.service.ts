import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import axios from 'axios';
import { Env } from '../../config/env';
import { CarrierContact, findCarrierByMc } from './carriers.mock';

export type SendResult = {
  sent: boolean;
  channel: 'email' | 'sms' | 'console';
  masked_destination: string;
  expires_in_seconds: number;
};

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'not_found' | 'expired' | 'mismatch' | 'exhausted'; attempts_left?: number };

type StoredOtp = {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
  contact: CarrierContact;
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
};

const maskPhone = (phone: string): string => {
  const last4 = phone.slice(-4);
  return `${'*'.repeat(Math.max(0, phone.length - 4))}${last4}`;
};

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly store = new Map<string, StoredOtp>();
  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly resendKey?: string;
  private readonly resendFrom: string;

  constructor(config: ConfigService<Env, true>) {
    this.ttlSeconds = config.get('OTP_TTL_SECONDS', { infer: true });
    this.maxAttempts = config.get('OTP_MAX_ATTEMPTS', { infer: true });
    this.resendKey = config.get('RESEND_API_KEY', { infer: true }) || undefined;
    this.resendFrom = config.get('RESEND_FROM', { infer: true });
  }

  async send(mcNum: string, channel: 'email' | 'sms' = 'email'): Promise<SendResult> {
    const contact = findCarrierByMc(mcNum);
    if (!contact) {
      throw new NotFoundException(`no contact on file for MC ${mcNum}`);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = Date.now() + this.ttlSeconds * 1000;

    this.store.set(mcNum, {
      code,
      expiresAt,
      attemptsLeft: this.maxAttempts,
      contact,
    });

    if (channel === 'sms') {
      this.logger.warn(`SMS channel not implemented; falling back to email for MC ${mcNum}`);
    }

    if (this.resendKey) {
      try {
        await axios.post(
          'https://api.resend.com/emails',
          {
            from: this.resendFrom,
            to: contact.email,
            subject: 'Your HappyRobot Logistics verification code',
            text: `Hello ${contact.legal_name},\n\nYour verification code is ${code}. It expires in ${Math.floor(this.ttlSeconds / 60)} minutes.\n\nIf you did not request this, ignore.\n`,
          },
          {
            headers: { Authorization: `Bearer ${this.resendKey}`, 'Content-Type': 'application/json' },
            timeout: 8000,
          },
        );
        return {
          sent: true,
          channel: 'email',
          masked_destination: maskEmail(contact.email),
          expires_in_seconds: this.ttlSeconds,
        };
      } catch (err) {
        this.logger.error(`Resend email failed for MC ${mcNum}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.warn(`OTP for MC ${mcNum} (${contact.email}): ${code} — no email provider configured or send failed`);
    return {
      sent: true,
      channel: 'console',
      masked_destination: maskEmail(contact.email),
      expires_in_seconds: this.ttlSeconds,
    };
  }

  verify(mcNum: string, code: string): VerifyResult {
    const entry = this.store.get(mcNum);
    if (!entry) return { valid: false, reason: 'not_found' };

    if (Date.now() > entry.expiresAt) {
      this.store.delete(mcNum);
      return { valid: false, reason: 'expired' };
    }

    if (entry.attemptsLeft <= 0) {
      this.store.delete(mcNum);
      return { valid: false, reason: 'exhausted' };
    }

    if (entry.code !== code) {
      entry.attemptsLeft -= 1;
      if (entry.attemptsLeft <= 0) {
        this.store.delete(mcNum);
        return { valid: false, reason: 'exhausted', attempts_left: 0 };
      }
      return { valid: false, reason: 'mismatch', attempts_left: entry.attemptsLeft };
    }

    this.store.delete(mcNum);
    return { valid: true };
  }
}
