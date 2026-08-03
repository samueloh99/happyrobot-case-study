import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env';
import { TmsClient, TmsFaultError, TmsRecord, TmsResult } from './tms.client';

export type Load = {
  load_id: string;
  origin: { city: string; state: string; zip: string };
  destination: { city: string; state: string; zip: string };
  pickup_datetime: string;
  delivery_datetime?: string;
  equipment_type: string;
  loadboard_rate: number;
  miles: number;
  weight?: number;
  commodity?: string;
  num_of_pieces?: number;
  dimensions?: string;
  notes?: string;
  status: string;
  max_buy?: number;
};

export type BookingResult = {
  load_id: string;
  booking_ref: string;
  status: string;
  timestamp: string;
  agreed_rate: number;
};

const parseIntOrUndef = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
};

const parseDatetime = (v: string | undefined): string => {
  if (!v || v.length !== 14) return v ?? '';
  const y = v.slice(0, 4);
  const mo = v.slice(4, 6);
  const d = v.slice(6, 8);
  const h = v.slice(8, 10);
  const mi = v.slice(10, 12);
  const s = v.slice(12, 14);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
};

const toLoad = (r: TmsRecord): Load => ({
  load_id: r.LOAD_ID,
  origin: { city: r.ORIG_CITY ?? '', state: r.ORIG_STATE ?? '', zip: r.ORIG_ZIP ?? '' },
  destination: { city: r.DEST_CITY ?? '', state: r.DEST_STATE ?? '', zip: r.DEST_ZIP ?? '' },
  pickup_datetime: parseDatetime(r.PICKUP_DT),
  delivery_datetime: r.DELIVERY_DT ? parseDatetime(r.DELIVERY_DT) : undefined,
  equipment_type: r.EQTYPE ?? '',
  loadboard_rate: parseIntOrUndef(r.RATE) ?? 0,
  miles: parseIntOrUndef(r.MILES) ?? 0,
  weight: parseIntOrUndef(r.WEIGHT),
  commodity: r.COMMODITY,
  num_of_pieces: parseIntOrUndef(r.PIECES),
  dimensions: r.DIMS,
  notes: r.NOTES,
  status: r.STATUS ?? '',
  max_buy: parseIntOrUndef(r.MAX_BUY),
});

@Injectable()
export class TmsService {
  private readonly logger = new Logger(TmsService.name);
  private readonly client: TmsClient;

  constructor(config: ConfigService<Env, true>) {
    this.client = new TmsClient(
      config.get('TMS_HOST', { infer: true }),
      config.get('TMS_PORT', { infer: true }),
      config.get('TMS_TOKEN', { infer: true }),
      config.get('TMS_CLIENT_TIMEOUT_MS', { infer: true }),
    );
  }

  private handle(result: TmsResult, notFoundCode?: string): TmsRecord[] {
    if (result.ok) return result.records;
    if (notFoundCode && result.code === notFoundCode) {
      throw new NotFoundException(result.msg || result.code);
    }
    throw new ServiceUnavailableException(`TMS error: ${result.code} ${result.msg}`);
  }

  async search(filters: Record<string, string | number>): Promise<Load[]> {
    try {
      const result = await this.client.search(filters);
      const records = this.handle(result);
      return records.map(toLoad).filter((l) => l.status === 'OPEN');
    } catch (e) {
      if (e instanceof TmsFaultError) {
        throw new ServiceUnavailableException(`TMS transport fault: ${e.kind}`);
      }
      throw e;
    }
  }

  async get(loadId: string): Promise<Load> {
    try {
      const result = await this.client.get(loadId);
      const records = this.handle(result, 'UNKNOWN_LOAD');
      if (records.length === 0) throw new NotFoundException(`load ${loadId} not found`);
      return toLoad(records[0]);
    } catch (e) {
      if (e instanceof TmsFaultError) {
        throw new ServiceUnavailableException(`TMS transport fault: ${e.kind}`);
      }
      throw e;
    }
  }

  async book(loadId: string, mcNum: string, agreedRate: number): Promise<BookingResult> {
    try {
      const result = await this.client.book(loadId, mcNum, agreedRate);
      if (!result.ok) {
        if (result.code === 'ALREADY_BOOKED') {
          throw new ServiceUnavailableException('load is already booked');
        }
        if (result.code === 'INVALID_RATE') {
          throw new ServiceUnavailableException('TMS rejected the rate');
        }
        if (result.code === 'UNKNOWN_LOAD') {
          throw new NotFoundException(`load ${loadId} not found`);
        }
        throw new ServiceUnavailableException(`TMS error: ${result.code} ${result.msg}`);
      }
      const r = result.records[0];
      if (!r) throw new ServiceUnavailableException('TMS returned no booking record');
      return {
        load_id: r.LOAD_ID ?? loadId,
        booking_ref: r.BOOKING_REF ?? '',
        status: r.STATUS ?? 'BOOKED',
        timestamp: parseDatetime(r.TIMESTAMP),
        agreed_rate: agreedRate,
      };
    } catch (e) {
      if (e instanceof TmsFaultError) {
        this.logger.error(`LOAD_BOOK fault (${e.kind}) — DO NOT retry, may have succeeded server-side`);
        throw new ServiceUnavailableException(
          `booking transport failed (${e.kind}); status uncertain, do not retry automatically`,
        );
      }
      throw e;
    }
  }
}
