
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import { PrismaService } from '../prisma/prisma.service.js';

import type { AppointmentAuditActor } from './appointment-audit.js';
import { AppointmentsService } from './appointments.service.js';

import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

@Controller('appointments')
@UseGuards(
  JwtAuthGuard,
  RolesGuard,
)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly prisma: PrismaService,
  ) {}

  /*
   * ETAPA 6.1 — IDENTIFICAÇÃO DO RESPONSÁVEL
   *
   * Utiliza a identidade validada pelo JWT.
   *
   * O usuário, a empresa e a função não são
   * recebidos pelo body da requisição.
   *
   * Apenas OWNER, ADMIN e RECEPTIONIST
   * podem realizar operações administrativas
   * de agendamento.
   *
   * Não identificamos essas operações como
   * SYSTEM, pois foram feitas por usuários.
   */
  private getAuditActor(
    user: JwtPayload,
  ): AppointmentAuditActor {
    if (
      user.role !== 'OWNER' &&
      user.role !== 'ADMIN' &&
      user.role !== 'RECEPTIONIST'
    ) {
      throw new ForbiddenException(
        'Usuário sem permissão para alterar agendamentos',
      );
    }

    return {
      type: 'USER',
      userId: user.sub,
      role: user.role,
    };
  }

  /*
   * CRIAÇÃO INTERNA
   *
   * O agendamento nasce CONFIRMED.
   *
   * A auditoria registra CREATED com
   * o usuário responsável.
   */
  @Post()
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  create(
    @CurrentUser()
    user: JwtPayload,

    @Body()
    data: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(
      user.tenantId,
      data,
      this.getAuditActor(user),
    );
  }

  /*
   * LISTAGEM DE AGENDAMENTOS
   *
   * Preserva as permissões existentes.
   *
   * STAFF continua limitado à própria
   * agenda pelas regras do service.
   */
  @Get()
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findAll(
    @CurrentUser()
    user: JwtPayload,

    @Query()
    query: ListAppointmentsQueryDto,
  ) {
    return this.appointmentsService.findAll(
      user.tenantId,
      query,
      user.membershipId,
      user.role,
    );
  }

  /*
   * HISTÓRICO DE AUDITORIA
   *
   * GET /appointments/:id/history
   *
   * OWNER, ADMIN e RECEPTIONIST podem
   * consultar os eventos.
   *
   * STAFF não possui acesso.
   *
   * O isolamento multiempresa é validado
   * antes da consulta dos registros.
   */
  @Get(':id/history')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  async findHistory(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,
  ) {
    /*
     * Confirma que o agendamento pertence
     * à empresa autenticada.
     *
     * Reutiliza a validação já existente
     * no AppointmentsService.
     */
    await this.appointmentsService.findOne(
      user.tenantId,
      id,
      user.membershipId,
      user.role,
    );

    /*
     * Consulta exclusivamente os eventos
     * vinculados à empresa e ao agendamento.
     *
     * Ordenação:
     * mais recente primeiro.
     *
     * Limite inicial:
     * 100 eventos.
     */
    const history =
      await this.prisma.appointmentAuditLog.findMany({
        where: {
          tenantId: user.tenantId,
          appointmentId: id,
        },

        select: {
          id: true,
          appointmentId: true,

          action: true,
          actorType: true,

          actorUserId: true,
          actorName: true,
          actorRole: true,

          before: true,
          after: true,

          createdAt: true,
        },

        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],

        take: 100,
      });

    return {
      appointmentId: id,
      data: history,
    };
  }

  /*
   * CONSULTA INDIVIDUAL
   *
   * Mantém o acesso STAFF restrito
   * ao profissional vinculado.
   */
  @Get(':id')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  )
  findOne(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,
  ) {
    return this.appointmentsService.findOne(
      user.tenantId,
      id,
      user.membershipId,
      user.role,
    );
  }

  /*
   * ALTERAÇÃO DE STATUS
   *
   * PENDING -> CONFIRMED
   * CONFIRMED -> COMPLETED
   * CONFIRMED -> NO_SHOW
   *
   * Encaminha o usuário autenticado
   * para a auditoria transacional.
   */
  @Patch(':id/status')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  updateStatus(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,

    @Body()
    data: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(
      user.tenantId,
      id,
      data,
      this.getAuditActor(user),
    );
  }

  /*
   * CANCELAMENTO
   *
   * Registra quem cancelou, o estado
   * anterior e os dados do cancelamento.
   */
  @Patch(':id/cancel')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  cancel(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,

    @Body()
    data: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancel(
      user.tenantId,
      id,
      data,
      this.getAuditActor(user),
    );
  }

  /*
   * REAGENDAMENTO
   *
   * Registra o usuário responsável e
   * os horários anteriores e novos.
   *
   * O service somente cria um evento
   * RESCHEDULED se houver mudança real.
   */
  @Patch(':id/reschedule')
  @Roles(
    'OWNER',
    'ADMIN',
    'RECEPTIONIST',
  )
  reschedule(
    @CurrentUser()
    user: JwtPayload,

    @Param('id')
    id: string,

    @Body()
    data: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(
      user.tenantId,
      id,
      data,
      this.getAuditActor(user),
    );
  }
}
