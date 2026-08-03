import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { emptyToUndef, stringToInt } from '../../../common/transformers';

export class EnqueueHandoffDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'call_id must be an opaque identifier' })
  call_id!: string;

  @IsString()
  @Matches(/^\d{5,8}$/, { message: 'mc_num must be 5-8 digits' })
  mc_num!: string;

  @IsString()
  @Matches(/^LD\d+$/, { message: 'load_id must match LD\\d+' })
  load_id!: string;

  @IsString()
  @Length(1, 64)
  booking_ref!: string;

  @Transform(stringToInt)
  @IsInt()
  @Min(1)
  agreed_rate!: number;

  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @Length(0, 32)
  callback_number?: string;

  @Transform(emptyToUndef)
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
