import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchLoadsDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  origin_city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'origin_state must be 2 uppercase letters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  origin_state?: string;

  @IsOptional()
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/, { message: 'origin_zip must be 5 digits' })
  origin_zip?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  destination_city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'destination_state must be 2 uppercase letters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  destination_state?: string;

  @IsOptional()
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/, { message: 'destination_zip must be 5 digits' })
  destination_zip?: string;

  @IsOptional()
  @IsString()
  @Length(1, 16)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  equipment_type?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_results?: number;
}
