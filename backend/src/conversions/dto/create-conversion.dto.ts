import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class CreateConversionDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  pin: string;
}

export class PreviewConversionDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsNumber()
  @Min(1)
  amount: number;
}
