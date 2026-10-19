import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @Matches(
    /^[a-z0-9-]+$/,
    {
      message:
        'slug deve conter apenas letras minúsculas, números e hífens',
    },
  )
  slug?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @Matches(
    /^#[0-9A-Fa-f]{6}$/,
    {
      message:
        'primaryColor deve estar no formato hexadecimal, exemplo: #F97316',
    },
  )
  primaryColor?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /*
   * Fuso horário da empresa.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  /*
   * Quantos minutos antes do horário
   * o cliente precisa agendar.
   *
   * Exemplo:
   * 60 = uma hora de antecedência.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  bookingMinAdvanceMinutes?: number;

  /*
   * Quantos dias à frente o
   * agendamento público permite.
   *
   * Exemplo:
   * 7 = hoje + próximos 7 dias.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bookingMaxAdvanceDays?: number;
}