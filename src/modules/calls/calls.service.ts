import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { LogCallDto } from './dto/log-call.dto';

export type StoredCall = LogCallDto & {
  logged_at: string;
};

export type Stats = {
  total: number;
  by_outcome: Record<string, number>;
  booked_revenue: number;
  average_agreed_rate: number | null;
  average_rounds: number | null;
};

const LOG_PATH = process.env.CALL_LOG_PATH ?? '/tmp/happyrobot-calls.jsonl';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  async log(dto: LogCallDto): Promise<StoredCall> {
    const record: StoredCall = { ...dto, logged_at: new Date().toISOString() };
    try {
      if (!existsSync(dirname(LOG_PATH))) {
        await mkdir(dirname(LOG_PATH), { recursive: true });
      }
      await appendFile(LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (err) {
      this.logger.error(`failed to append call log: ${err instanceof Error ? err.message : String(err)}`);
    }
    return record;
  }

  async list(limit = 100): Promise<StoredCall[]> {
    try {
      const raw = await readFile(LOG_PATH, 'utf8');
      const lines = raw.split('\n').filter((l) => l.length > 0);
      const parsed = lines
        .map((l) => {
          try {
            return JSON.parse(l) as StoredCall;
          } catch {
            return null;
          }
        })
        .filter((x): x is StoredCall => x !== null);
      return parsed.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  async stats(): Promise<Stats> {
    const calls = await this.list(10_000);
    const byOutcome: Record<string, number> = {};
    let bookedRevenue = 0;
    let totalRate = 0;
    let rateCount = 0;
    let totalRounds = 0;
    let roundsCount = 0;

    for (const c of calls) {
      byOutcome[c.outcome] = (byOutcome[c.outcome] ?? 0) + 1;
      if (c.outcome === 'booked' && c.agreed_rate) {
        bookedRevenue += c.agreed_rate;
        totalRate += c.agreed_rate;
        rateCount += 1;
      }
      if (c.rounds !== undefined) {
        totalRounds += c.rounds;
        roundsCount += 1;
      }
    }

    return {
      total: calls.length,
      by_outcome: byOutcome,
      booked_revenue: bookedRevenue,
      average_agreed_rate: rateCount > 0 ? Math.round(totalRate / rateCount) : null,
      average_rounds: roundsCount > 0 ? Number((totalRounds / roundsCount).toFixed(2)) : null,
    };
  }
}
