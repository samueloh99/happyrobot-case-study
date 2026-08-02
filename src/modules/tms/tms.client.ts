import * as net from 'node:net';
import { Logger } from '@nestjs/common';

export type TmsRecord = Record<string, string>;

export type TmsSuccess = { ok: true; records: TmsRecord[] };
export type TmsError = { ok: false; code: string; msg: string };
export type TmsResult = TmsSuccess | TmsError;

export type TmsFaultKind = 'timeout' | 'partial' | 'malformed';

export class TmsFaultError extends Error {
  constructor(public readonly kind: TmsFaultKind, message: string) {
    super(`TMS fault [${kind}]: ${message}`);
    this.name = 'TmsFaultError';
  }
}

const buildFrame = (cmd: string, token: string, fields: Record<string, string | number>): string => {
  const parts = [`CMD:${cmd}`, `AUTH:${token}`];
  for (const [k, v] of Object.entries(fields)) {
    const value = String(v);
    if (value.includes('|') || value.includes('\r') || value.includes('\n')) {
      throw new Error(`field value for ${k} contains reserved chars`);
    }
    parts.push(`${k}:${value}`);
  }
  return `${parts.join('|')}\r\n`;
};

const parseRecord = (line: string): TmsRecord => {
  const record: TmsRecord = {};
  for (const pair of line.split('|')) {
    const idx = pair.indexOf(':');
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1).trimEnd();
    record[key] = value;
  }
  return record;
};

const parseResponse = (raw: string): TmsResult => {
  if (raw.length === 0) throw new TmsFaultError('malformed', 'empty response');

  const lines = raw.split('\r\n');

  if (lines[0].startsWith('ERR|')) {
    const record = parseRecord(lines[0]);
    return { ok: false, code: record.CODE ?? 'UNKNOWN', msg: record.MSG ?? '' };
  }

  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) throw new TmsFaultError('malformed', 'no lines');

  const last = nonEmpty[nonEmpty.length - 1];
  if (last !== 'END') {
    throw new TmsFaultError('partial', `expected END terminator, got: ${JSON.stringify(last)}`);
  }

  const recordLines = nonEmpty.slice(0, -1);
  const records = recordLines.map(parseRecord);

  for (const r of records) {
    if (!r.LOAD_ID && Object.keys(r).length > 0) {
      throw new TmsFaultError('malformed', `record without LOAD_ID: ${JSON.stringify(r)}`);
    }
  }

  return { ok: true, records };
};

const isCompleteResponse = (raw: string): boolean => {
  const lines = raw.split('\r\n');
  if (lines[0]?.startsWith('ERR|') && lines.length >= 2) return true;
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return false;
  return nonEmpty[nonEmpty.length - 1] === 'END' && raw.endsWith('\r\n');
};

export class TmsClient {
  private readonly logger = new Logger(TmsClient.name);

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  private sendFrame(frame: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new TmsFaultError('timeout', `no complete response within ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(Buffer.concat(chunks).toString('ascii'));
      };

      socket.setNoDelay(true);
      socket.on('connect', () => socket.write(frame));
      socket.on('data', (d) => {
        chunks.push(d);
        const raw = Buffer.concat(chunks).toString('ascii');
        if (isCompleteResponse(raw)) finish();
      });
      socket.on('end', finish);
      socket.on('close', finish);
      socket.on('error', (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  private async execute(
    cmd: string,
    fields: Record<string, string | number>,
    retries: number,
  ): Promise<TmsResult> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const raw = await this.sendFrame(buildFrame(cmd, this.token, fields));
        return parseResponse(raw);
      } catch (e) {
        lastErr = e;
        if (e instanceof TmsFaultError && attempt < retries) {
          const backoff = 150 + Math.floor(Math.random() * 250);
          this.logger.warn(`${cmd} attempt ${attempt + 1} failed (${e.kind}); retry in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  search(fields: Record<string, string | number>): Promise<TmsResult> {
    return this.execute('LOAD_QUERY', fields, 2);
  }

  get(loadId: string): Promise<TmsResult> {
    return this.execute('LOAD_GET', { LOAD_ID: loadId }, 2);
  }

  book(loadId: string, mcNum: string, agreedRate: number): Promise<TmsResult> {
    return this.execute('LOAD_BOOK', { LOAD_ID: loadId, MC_NUM: mcNum, AGREED_RATE: agreedRate }, 0);
  }

  debugEcho(msg: string): Promise<TmsResult> {
    return this.execute('DEBUG_ECHO', { MSG: msg }, 0);
  }
}
