import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { stringToInt, stringToOptionalInt } from '../../../common/transformers';

export class EvaluateOfferDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'call_id must be an opaque identifier' })
  call_id!: string;

  @IsString()
  @Matches(/^LD\d+$/, { message: 'load_id must match LD\\d+' })
  load_id!: string;

  @IsString()
  @Matches(/^\d{5,8}$/, { message: 'mc_num must be 5-8 digits' })
  mc_num!: string;

  @Transform(stringToInt)
  @IsInt()
  @Min(1)
  offer!: number;

  @Transform(stringToOptionalInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  round_hint?: number;
}
