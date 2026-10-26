
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  Throttle,
  ThrottlerGuard,
} from '@nestjs/throttler';

import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto.js';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto.js';
import { PublicEmployeesQueryDto } from './dto/public-employees-query.dto.js';

import { PublicBookingService } from './public-booking.service.js';
import { TurnstileVerificationService } from './turnstile-verification.service.js';

@Controller(
  'public/tenants/:slug',
)
@UseGuards(
  ThrottlerGuard,
)
export class PublicBookingController {
  constructor(
    private readonly publicBookingService: PublicBookingService,
    private readonly turnstileVerificationService: TurnstileVerificationService,
  ) {}

  /*
   * CONSULTA PÚBLICA DA EMPRESA
   *
   * Retorna as informações públicas
   * da empresa pelo slug.
   */
  @Get()
  findTenant(
    @Param('slug') slug: string,
  ) {
    return this.publicBookingService.findTenant(
      slug,
    );
  }

  /*
   * SERVIÇOS DISPONÍVEIS
   */
  @Get('services')
  findServices(
    @Param('slug') slug: string,
  ) {
    return this.publicBookingService.findServices(
      slug,
    );
  }

  /*
   * FUNCIONÁRIOS DISPONÍVEIS
   */
  @Get('employees')
  findEmployees(
    @Param('slug') slug: string,

    @Query()
    query: PublicEmployeesQueryDto,
  ) {
    return this.publicBookingService.findEmployees(
      slug,
      query,
    );
  }

  /*
   * CONSULTA DE DISPONIBILIDADE
   *
   * Preserva as regras existentes
   * de horários, bloqueios, serviços
   * e agendamentos.
   */
  @Get('availability')
  findAvailability(
    @Param('slug') slug: string,

    @Query()
    query: PublicAvailabilityQueryDto,
  ) {
    return this.publicBookingService.findAvailability(
      slug,
      query,
    );
  }

  /*
   * ETAPA 6.2 — AGENDAMENTO PÚBLICO
   *
   * PROTEÇÕES:
   *
   * 1. Rate limit de 20 tentativas/minuto/IP.
   *
   * 2. Validação do DTO pelo ValidationPipe.
   *
   * 3. Verificação do Cloudflare Turnstile
   *    antes de criar o agendamento.
   *
   * 4. Validações de disponibilidade,
   *    conflitos e regras de negócio
   *    pelo PublicBookingService.
   *
   * 5. Persistência transacional de
   *    agendamento, auditoria e notificação.
   *
   * IMPORTANTE:
   *
   * O token é verificado pelo backend.
   * O frontend não decide se a
   * verificação foi aprovada.
   *
   * Quando TURNSTILE_ENABLED=true,
   * a ausência ou rejeição do token
   * impede a criação do agendamento.
   */
  @Post('appointments')
  @Throttle({
    default: {
      ttl: 60_000,
      limit: 20,
    },
  })
  async createAppointment(
    @Param('slug')
    slug: string,

    @Body()
    data: CreatePublicAppointmentDto,
  ) {
    /*
     * PASSO 1 — VERIFICAÇÃO ANTI-BOT
     *
     * A operação só continua se a
     * proteção estiver desativada no
     * desenvolvimento ou se o token
     * for validado com sucesso.
     *
     * Nenhuma gravação de agendamento
     * é iniciada antes dessa validação.
     */
    await this.turnstileVerificationService.verify(
      data.turnstileToken,
    );

    /*
     * PASSO 2 — CRIAÇÃO DO AGENDAMENTO
     *
     * Somente após a verificação
     * executamos as regras de negócio
     * e a transação já implementadas.
     *
     * O token de segurança não precisa
     * ser persistido no banco.
     */
    return this.publicBookingService.createAppointment(
      slug,
      data,
    );
  }
}
