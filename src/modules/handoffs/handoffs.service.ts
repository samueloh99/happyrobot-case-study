import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EnqueueHandoffDto } from './dto/enqueue-handoff.dto';

export type EnqueueResult = {
  handoff_id: string;
  position_in_queue: number;
  eta_minutes: number;
  accepted_at: string;
  message: string;
};

@Injectable()
export class HandoffsService {
  private readonly logger = new Logger(HandoffsService.name);

  enqueue(dto: EnqueueHandoffDto): EnqueueResult {
    const handoff_id = `HO-${randomBytes(6).toString('hex').toUpperCase()}`;
    const position_in_queue = 1 + Math.floor(Math.random() * 3);
    const eta_minutes = 5 + position_in_queue * 5;

    this.logger.log(
      `HANDOFF ${handoff_id} queued: call=${dto.call_id} mc=${dto.mc_num} load=${dto.load_id} ` +
        `booking=${dto.booking_ref} rate=$${dto.agreed_rate} callback=${dto.callback_number ?? 'n/a'} ` +
        `→ position ${position_in_queue}, ETA ${eta_minutes}m`,
    );

    return {
      handoff_id,
      position_in_queue,
      eta_minutes,
      accepted_at: new Date().toISOString(),
      message: `Senior rep queue accepted the handoff. Position ${position_in_queue}, estimated callback in ${eta_minutes} minutes.`,
    };
  }
}
