import { IsString, Matches } from 'class-validator';

export class VerifyCarrierDto {
  @IsString()
  @Matches(/^\d{5,8}$/, { message: 'mc_num must be 5-8 digits' })
  mc_num!: string;
}
