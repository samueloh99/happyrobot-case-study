import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env';
import { TmsService } from '../tms/tms.service';

export type EvaluateResult = {
  action: 'accept' | 'counter' | 'reject';
  round: number;
  final: boolean;
  agreed_rate?: number;
  counter_offer?: number;
  reason?: string;
};

type Session = {
  loadId: string;
  mcNum: string;
  maxBuy: number;
  loadboardRate: number;
  round: number;
  lastCounter?: number;
  createdAt: number;
};

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);
  private readonly sessions = new Map<string, Session>();
  private readonly maxRounds: number;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly tms: TmsService,
    config: ConfigService<Env, true>,
  ) {
    this.maxRounds = config.get('NEGOTIATION_MAX_ROUNDS', { infer: true });
    this.sessionTtlMs = config.get('NEGOTIATION_SESSION_TTL_SECONDS', { infer: true }) * 1000;
    setInterval(() => this.gc(), 60_000).unref();
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, v] of this.sessions) {
      if (now - v.createdAt > this.sessionTtlMs) this.sessions.delete(k);
    }
  }

  private async loadSession(callId: string, loadId: string, mcNum: string): Promise<Session> {
    const existing = this.sessions.get(callId);
    if (existing && existing.loadId === loadId && existing.mcNum === mcNum) return existing;

    const load = await this.tms.get(loadId);
    if (load.max_buy === undefined) {
      throw new NotFoundException(`load ${loadId} does not expose MAX_BUY on this token`);
    }
    const session: Session = {
      loadId,
      mcNum,
      maxBuy: load.max_buy,
      loadboardRate: load.loadboard_rate,
      round: 0,
      createdAt: Date.now(),
    };
    this.sessions.set(callId, session);
    return session;
  }

  private nextCounter(session: Session, offer: number): number {
    const anchor = session.lastCounter ?? session.loadboardRate;
    const midpoint = Math.floor((anchor + offer) / 2);
    const ceiling = session.maxBuy - 50;
    const floor = Math.max(anchor, session.loadboardRate);
    return Math.max(floor, Math.min(midpoint, ceiling));
  }

  async evaluate(input: {
    call_id: string;
    load_id: string;
    mc_num: string;
    offer: number;
  }): Promise<EvaluateResult> {
    const session = await this.loadSession(input.call_id, input.load_id, input.mc_num);
    session.round += 1;

    if (input.offer <= session.maxBuy) {
      this.sessions.delete(input.call_id);
      return {
        action: 'accept',
        round: session.round,
        final: true,
        agreed_rate: input.offer,
      };
    }

    if (session.round >= this.maxRounds) {
      this.sessions.delete(input.call_id);
      return {
        action: 'reject',
        round: session.round,
        final: true,
        reason: 'max rounds reached without agreement',
      };
    }

    const counter = this.nextCounter(session, input.offer);
    session.lastCounter = counter;

    return {
      action: 'counter',
      round: session.round,
      final: false,
      counter_offer: counter,
    };
  }

  reset(callId: string): void {
    this.sessions.delete(callId);
  }
}
