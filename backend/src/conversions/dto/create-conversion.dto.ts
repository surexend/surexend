import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class CreateConversionDto {
  @IsNumber()
  @Min(1)
  usdtAmount: number;

  @IsString()
  @IsNotEmpty()
  fiatCurrency: string;

  @IsString()
  @IsNotEmpty()
  bankAccountId: string;

  @IsString()
  @IsNotEmpty()
  pin: string;
}

export class PreviewConversionDto {
  @IsNumber()
  @Min(1)
  usdtAmount: number;

  @IsString()
  @IsNotEmpty()
  fiatCurrency: string;
}
