import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { emptyToUndef, stringToOptionalInt } from '../../../common/transformers';

export class LogCallDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  call_id!: string;

  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @Matches(/^\d{5,8}$/)
  mc_num?: string;

  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @Matches(/^LD\d+$/)
  load_id?: string;

  @Transform(stringToOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  agreed_rate?: number;

  @Transform(stringToOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(0)
  rounds?: number;

  @IsIn([
    'booked',
    'no_load_found',
    'fmcsa_failed',
    'otp_failed',
    'negotiation_failed',
    'booking_failed',
    'carrier_hangup',
    'error',
  ])
  outcome!:
    | 'booked'
    | 'no_load_found'
    | 'fmcsa_failed'
    | 'otp_failed'
    | 'negotiation_failed'
    | 'booking_failed'
    | 'carrier_hangup'
    | 'error';

  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @Length(0, 4000)
  transcript?: string;

  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
