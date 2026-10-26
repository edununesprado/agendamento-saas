
import { Type } from 'class-transformer';

import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/*
 * DADOS DO CLIENTE
 *
 * Mantém as validações já existentes
 * para nome, telefone e e-mail.
 */
export class PublicClientDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^[0-9()+\s-]{8,20}$/,
    {
      message:
        'phone deve conter apenas números, espaços, parênteses, + ou -',
    },
  )
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}

/*
 * AGENDAMENTO PÚBLICO
 *
 * Valida:
 * - Funcionário
 * - Serviço
 * - Data e horário
 * - Cliente
 * - Observações
 * - Token de proteção anti-bot
 */
export class CreatePublicAppointmentDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsISO8601()
  @Matches(
    /(?:Z|[+-]\d{2}:\d{2})$/,
    {
      message:
        'startsAt deve informar o fuso horário, por exemplo Z ou -03:00',
    },
  )
  startsAt!: string;

  @ValidateNested()
  @Type(
    () => PublicClientDto,
  )
  client!: PublicClientDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /*
   * ETAPA 6.2 — CLOUDFLARE TURNSTILE
   *
   * Token gerado pelo widget de
   * segurança no frontend.
   *
   * É opcional no DTO para preservar
   * compatibilidade durante a
   * implementação e nos testes locais.
   *
   * Quando o Turnstile estiver ativo,
   * o serviço de verificação exigirá
   * um token válido antes de permitir
   * a criação do agendamento.
   *
   * O token não deve ser armazenado
   * no banco de dados.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}
