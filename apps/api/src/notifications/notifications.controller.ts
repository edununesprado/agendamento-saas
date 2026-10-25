
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import { DateTime } from 'luxon';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { JwtPayload } from '../auth/types/jwt-payload.js';

import type { Prisma } from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service.js';

const NOTIFICATION_TIMEZONE =
  'America/Sao_Paulo';

const NOTIFICATION_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELED',
  'UNCERTAIN',
] as const;

const NOTIFICATION_TYPES = [
  'APPOINTMENT_REQUESTED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_REMINDER',
] as const;

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * Validação dos parâmetros
   * numéricos de paginação.
   */
  private parsePositiveInteger(
    value: unknown,
    field: string,
    defaultValue: number,
    maxValue?: number,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }

    if (
      typeof value !== 'string' ||
      !/^[1-9]\d*$/.test(value)
    ) {
      throw new BadRequestException(
        `O parâmetro ${field} deve ser um número inteiro positivo`,
      );
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
      throw new BadRequestException(
        `O parâmetro ${field} é inválido`,
      );
    }

    if (
      maxValue !== undefined &&
      parsed > maxValue
    ) {
      throw new BadRequestException(
        `O parâmetro ${field} não pode ser maior que ${maxValue}`,
      );
    }

    return parsed;
  }

  /*
   * Validação dos filtros
   * de status e tipo.
   */
  private parseEnumFilter<
    T extends string,
  >(
    value: unknown,
    field: string,
    allowedValues: readonly T[],
  ): T | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      typeof value !== 'string' ||
      !allowedValues.some(
        (allowed) => allowed === value,
      )
    ) {
      throw new BadRequestException(
        `O parâmetro ${field} possui um valor inválido. Valores permitidos: ${allowedValues.join(', ')}`,
      );
    }

    return value as T;
  }

  /*
   * Validação de datas.
   *
   * Formato aceito:
   * YYYY-MM-DD
   *
   * O dia é interpretado
   * no fuso America/Sao_Paulo.
   */
  private parseDateFilter(
    value: unknown,
    field: string,
  ): DateTime | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      throw new BadRequestException(
        `O parâmetro ${field} deve estar no formato YYYY-MM-DD`,
      );
    }

    const date = DateTime.fromISO(
      value,
      {
        zone: NOTIFICATION_TIMEZONE,
      },
    );

    if (
      !date.isValid ||
      date.toISODate() !== value
    ) {
      throw new BadRequestException(
        `O parâmetro ${field} contém uma data inválida`,
      );
    }

    return date.startOf('day');
  }

  /*
   * GET /notifications/summary
   *
   * Retorna as quantidades de
   * notificações agrupadas por status.
   *
   * Segurança:
   * - Exige JWT válido.
   * - Permite OWNER e ADMIN.
   * - Usa o tenantId autenticado.
   *
   * A consulta é somente de leitura.
   * Não envia nem reprocessa e-mails.
   */
  @Get('summary')
  async getSummary(
    @CurrentUser() user: JwtPayload,
  ) {
    const groups =
      await this.prisma.notificationDelivery.groupBy({
        by: ['status'],

        where: {
          tenantId: user.tenantId,
        },

        _count: {
          _all: true,
        },
      });

    /*
     * Inicializamos todos os status
     * com zero para que o frontend
     * sempre receba o mesmo formato,
     * mesmo quando não há registros.
     */
    const counts = {
      PENDING: 0,
      PROCESSING: 0,
      SENT: 0,
      FAILED: 0,
      CANCELED: 0,
      UNCERTAIN: 0,
    };

    for (const group of groups) {
      counts[group.status] =
        group._count._all;
    }

    const total = Object.values(
      counts,
    ).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      total,
      pending: counts.PENDING,
      processing: counts.PROCESSING,
      sent: counts.SENT,
      failed: counts.FAILED,
      canceled: counts.CANCELED,
      uncertain: counts.UNCERTAIN,
    };
  }

  /*
   * GET /notifications
   *
   * Paginação:
   * - page
   * - limit
   *
   * Filtros:
   * - status
   * - type
   * - startDate
   * - endDate
   *
   * Somente OWNER e ADMIN.
   */
  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') pageRaw: unknown,
    @Query('limit') limitRaw: unknown,
    @Query('status') statusRaw: unknown,
    @Query('type') typeRaw: unknown,
    @Query('startDate') startDateRaw: unknown,
    @Query('endDate') endDateRaw: unknown,
  ) {
    const page = this.parsePositiveInteger(
      pageRaw,
      'page',
      1,
    );

    const limit = this.parsePositiveInteger(
      limitRaw,
      'limit',
      20,
      100,
    );

    const status = this.parseEnumFilter(
      statusRaw,
      'status',
      NOTIFICATION_STATUSES,
    );

    const type = this.parseEnumFilter(
      typeRaw,
      'type',
      NOTIFICATION_TYPES,
    );

    const startDate = this.parseDateFilter(
      startDateRaw,
      'startDate',
    );

    const endDate = this.parseDateFilter(
      endDateRaw,
      'endDate',
    );

    if (
      startDate !== undefined &&
      endDate !== undefined &&
      startDate.toMillis() > endDate.toMillis()
    ) {
      throw new BadRequestException(
        'startDate não pode ser posterior a endDate',
      );
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      throw new BadRequestException(
        'A página solicitada é muito grande',
      );
    }

    /*
     * Isolamento multi-tenant:
     *
     * Nunca utilizamos tenantId
     * recebido pela URL.
     */
    const where: Prisma.NotificationDeliveryWhereInput = {
      tenantId: user.tenantId,
    };

    if (status !== undefined) {
      where.status = status;
    }

    if (type !== undefined) {
      where.type = type;
    }

    /*
     * Filtro de período:
     *
     * startDate é inclusivo.
     * endDate inclui todo o dia.
     *
     * Usamos o início do dia seguinte
     * como limite superior exclusivo.
     */
    if (
      startDate !== undefined ||
      endDate !== undefined
    ) {
      const createdAtFilter:
        NonNullable<
          Prisma.NotificationDeliveryWhereInput['createdAt']
        > = {};

      if (startDate !== undefined) {
        createdAtFilter.gte =
          startDate.toUTC().toJSDate();
      }

      if (endDate !== undefined) {
        createdAtFilter.lt =
          endDate
            .plus({ days: 1 })
            .toUTC()
            .toJSDate();
      }

      where.createdAt = createdAtFilter;
    }

    /*
     * Consulta somente de leitura.
     *
     * Preserva status UNCERTAIN
     * e não dispara SMTP.
     */
    const [total, data] = await Promise.all([
      this.prisma.notificationDelivery.count({
        where,
      }),

      this.prisma.notificationDelivery.findMany({
        where,

        select: {
          id: true,
          appointmentId: true,
          type: true,
          status: true,
          recipient: true,
          subject: true,
          attempts: true,
          maxAttempts: true,
          nextAttemptAt: true,
          lastAttemptAt: true,
          processingStartedAt: true,
          sentAt: true,
          failedAt: true,
          lastError: true,
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

        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
