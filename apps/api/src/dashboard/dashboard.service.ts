import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import { PrismaService } from '../prisma/prisma.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getDashboard(
    tenantId: string,
    query: DashboardQueryDto,
  ) {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          id: tenantId,
        },

        select: {
          timezone: true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    const selectedStart =
      DateTime.fromISO(
        query.startDate,
        {
          zone: tenant.timezone,
        },
      );

    const selectedEnd =
      DateTime.fromISO(
        query.endDate,
        {
          zone: tenant.timezone,
        },
      );

    if (
      !selectedStart.isValid ||
      !selectedEnd.isValid
    ) {
      throw new BadRequestException(
        'Período inválido',
      );
    }

    if (
      selectedEnd
        .startOf('day')
        .toMillis() <
      selectedStart
        .startOf('day')
        .toMillis()
    ) {
      throw new BadRequestException(
        'endDate não pode ser anterior a startDate',
      );
    }

    const startsAt =
      selectedStart
        .startOf('day')
        .toUTC()
        .toJSDate();

    const endsAt =
      selectedEnd
        .plus({
          days: 1,
        })
        .startOf('day')
        .toUTC()
        .toJSDate();

    const periodFilter = {
      tenantId,

      startsAt: {
        gte: startsAt,
        lt: endsAt,
      },
    };

    const [
      total,
      pending,
      confirmed,
      completed,
      canceled,
      noShow,
      revenue,
      attendedClients,
    ] = await Promise.all([
      // Total
      this.prisma.appointment.count({
        where: periodFilter,
      }),

      // Pendentes
      this.prisma.appointment.count({
        where: {
          ...periodFilter,
          status: 'PENDING',
        },
      }),

      // Confirmados
      this.prisma.appointment.count({
        where: {
          ...periodFilter,
          status: 'CONFIRMED',
        },
      }),

      // Concluídos
      this.prisma.appointment.count({
        where: {
          ...periodFilter,
          status: 'COMPLETED',
        },
      }),

      // Cancelados
      this.prisma.appointment.count({
        where: {
          ...periodFilter,
          status: 'CANCELED',
        },
      }),

      // Não compareceu
      this.prisma.appointment.count({
        where: {
          ...periodFilter,
          status: 'NO_SHOW',
        },
      }),

      // Faturamento somente dos concluídos
      this.prisma.appointment.aggregate({
        where: {
          ...periodFilter,
          status: 'COMPLETED',
        },

        _sum: {
          priceCents: true,
        },
      }),

      // Clientes únicos que tiveram atendimento concluído
      this.prisma.appointment.findMany({
        where: {
          ...periodFilter,
          status: 'COMPLETED',
        },

        select: {
          clientId: true,
        },

        distinct: [
          'clientId',
        ],
      }),
    ]);

    const completedRevenueCents =
      revenue._sum.priceCents ?? 0;

    return {
      period: {
        startDate:
          query.startDate,
        endDate:
          query.endDate,
        timezone:
          tenant.timezone,
      },

      appointments: {
        total,
        pending,
        confirmed,
        completed,
        canceled,
        noShow,
      },

      revenue: {
        completedCents:
          completedRevenueCents,

        completed:
          completedRevenueCents /
          100,
      },

      clients: {
        attended:
          attendedClients.length,
      },
    };
  }
}