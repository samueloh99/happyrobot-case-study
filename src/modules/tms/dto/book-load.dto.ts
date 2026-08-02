import { IsInt, IsString, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { stringToInt } from '../../../common/transformers';

export class BookLoadDto {
  @IsString()
  @Matches(/^LD\d+$/, { message: 'load_id must match LD\\d+' })
  load_id!: string;

  @IsString()
  @Matches(/^\d{5,8}$/, { message: 'mc_num must be 5-8 digits' })
  mc_num!: string;

  @Transform(stringToInt)
  @IsInt()
  @Min(1)
  agreed_rate!: number;
}
