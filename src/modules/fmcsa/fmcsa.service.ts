import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Env } from '../../config/env';

export type VerifyResult = {
  eligible: boolean;
  reason?: string;
  mc_num: string;
  dot_number?: string;
  legal_name?: string;
  status_code?: string;
  allowed_to_operate?: string;
};

type FmcsaCarrierResponse = {
  content?: Array<{
    carrier?: {
      dotNumber?: number;
      legalName?: string;
      dbaName?: string;
      allowedToOperate?: string;
      statusCode?: string;
      brokerAuthorityStatus?: string;
      commonAuthorityStatus?: string;
    };
  }>;
};

@Injectable()
export class FmcsaService {
  private readonly logger = new Logger(FmcsaService.name);
  private readonly http: AxiosInstance;
  private readonly webKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.webKey = config.get('FMCSA_WEB_KEY', { infer: true });
    this.http = axios.create({
      baseURL: config.get('FMCSA_BASE_URL', { infer: true }),
      timeout: 8000,
      headers: { Accept: 'application/json' },
    });
  }

  async verify(mcNum: string): Promise<VerifyResult> {
    try {
      const { data } = await this.http.get<FmcsaCarrierResponse>(`/carriers/docket-number/${mcNum}`, {
        params: { webKey: this.webKey },
      });

      const carrier = data.content?.[0]?.carrier;
      if (!carrier) {
        return { eligible: false, reason: 'carrier not found in FMCSA registry', mc_num: mcNum };
      }

      const allowed = (carrier.allowedToOperate ?? '').toUpperCase();
      const status = (carrier.statusCode ?? '').toUpperCase();

      const eligible = allowed === 'Y' && status === 'A';

      return {
        eligible,
        reason: eligible ? undefined : `not authorized (allowedToOperate=${carrier.allowedToOperate}, statusCode=${carrier.statusCode})`,
        mc_num: mcNum,
        dot_number: carrier.dotNumber ? String(carrier.dotNumber) : undefined,
        legal_name: carrier.legalName ?? carrier.dbaName,
        status_code: carrier.statusCode,
        allowed_to_operate: carrier.allowedToOperate,
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        this.logger.warn(`FMCSA lookup for MC ${mcNum} failed: ${err.message} (status=${err.response?.status})`);
        if (err.response?.status === 404) {
          return { eligible: false, reason: 'carrier not found in FMCSA registry', mc_num: mcNum };
        }
        throw new ServiceUnavailableException(`FMCSA service unavailable: ${err.message}`);
      }
      throw err;
    }
  }
}
