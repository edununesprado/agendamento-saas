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
      selectedEnd.startOf('day').toMillis() <
      selectedStart.startOf('day').toMillis()
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

    const appointments =
      await this.prisma.appointment.findMany({
        where: {
          tenantId,

          startsAt: {
            gte: startsAt,
            lt: endsAt,
          },
        },

        include: {
          employee: {
            select: {
              id: true,
              name: true,
            },
          },

          service: {
            select: {
              id: true,
              name: true,
            },
          },
        },

        orderBy: {
          startsAt: 'asc',
        },
      });

    const total =
      appointments.length;

    const pending =
      appointments.filter(
        (appointment) =>
          appointment.status === 'PENDING',
      ).length;

    const confirmed =
      appointments.filter(
        (appointment) =>
          appointment.status === 'CONFIRMED',
      ).length;

    const completed =
      appointments.filter(
        (appointment) =>
          appointment.status === 'COMPLETED',
      ).length;

    const canceled =
      appointments.filter(
        (appointment) =>
          appointment.status === 'CANCELED',
      ).length;

    const noShow =
      appointments.filter(
        (appointment) =>
          appointment.status === 'NO_SHOW',
      ).length;

    // Faturamento realizado
    const completedRevenueCents =
      appointments
        .filter(
          (appointment) =>
            appointment.status === 'COMPLETED',
        )
        .reduce(
          (total, appointment) =>
            total +
            appointment.priceCents,
          0,
        );

    // Receita dos horários ainda confirmados
    const confirmedRevenueCents =
      appointments
        .filter(
          (appointment) =>
            appointment.status === 'CONFIRMED',
        )
        .reduce(
          (total, appointment) =>
            total +
            appointment.priceCents,
          0,
        );

    // Clientes únicos atendidos
    const attendedClientIds =
      new Set(
        appointments
          .filter(
            (appointment) =>
              appointment.status === 'COMPLETED',
          )
          .map(
            (appointment) =>
              appointment.clientId,
          ),
      );

    // -----------------------------------
    // FATURAMENTO POR DIA
    // -----------------------------------

    const revenueByDayMap =
      new Map<
        string,
        {
          date: string;
          appointments: number;
          revenueCents: number;
        }
      >();

    for (
      const appointment of appointments
    ) {
      if (
        appointment.status !== 'COMPLETED'
      ) {
        continue;
      }

      const localDate =
        DateTime.fromJSDate(
          appointment.startsAt,
          {
            zone: tenant.timezone,
          },
        ).toISODate();

      if (!localDate) {
        continue;
      }

      const current =
        revenueByDayMap.get(
          localDate,
        ) ?? {
          date: localDate,
          appointments: 0,
          revenueCents: 0,
        };

      current.appointments += 1;

      current.revenueCents +=
        appointment.priceCents;

      revenueByDayMap.set(
        localDate,
        current,
      );
    }

    const revenueByDay =
      Array.from(
        revenueByDayMap.values(),
      )
        .sort(
          (a, b) =>
            a.date.localeCompare(
              b.date,
            ),
        )
        .map((item) => ({
          ...item,

          revenue:
            item.revenueCents /
            100,
        }));

    // -----------------------------------
    // SERVIÇOS MAIS REALIZADOS
    // -----------------------------------

    const servicesMap =
      new Map<
        string,
        {
          serviceId: string;
          serviceName: string;
          completed: number;
          revenueCents: number;
        }
      >();

    for (
      const appointment of appointments
    ) {
      if (
        appointment.status !== 'COMPLETED'
      ) {
        continue;
      }

      const current =
        servicesMap.get(
          appointment.serviceId,
        ) ?? {
          serviceId:
            appointment.serviceId,

          serviceName:
            appointment.service.name,

          completed: 0,

          revenueCents: 0,
        };

      current.completed += 1;

      current.revenueCents +=
        appointment.priceCents;

      servicesMap.set(
        appointment.serviceId,
        current,
      );
    }

    const topServices =
      Array.from(
        servicesMap.values(),
      )
        .sort(
          (a, b) =>
            b.completed -
            a.completed,
        )
        .map((item) => ({
          ...item,

          revenue:
            item.revenueCents /
            100,
        }));

    // -----------------------------------
    // DESEMPENHO POR PROFISSIONAL
    // -----------------------------------

    const employeesMap =
      new Map<
        string,
        {
          employeeId: string;
          employeeName: string;
          total: number;
          completed: number;
          confirmed: number;
          canceled: number;
          noShow: number;
          revenueCents: number;
        }
      >();

    for (
      const appointment of appointments
    ) {
      const current =
        employeesMap.get(
          appointment.employeeId,
        ) ?? {
          employeeId:
            appointment.employeeId,

          employeeName:
            appointment.employee.name,

          total: 0,
          completed: 0,
          confirmed: 0,
          canceled: 0,
          noShow: 0,
          revenueCents: 0,
        };

      current.total += 1;

      if (
        appointment.status ===
        'COMPLETED'
      ) {
        current.completed += 1;

        current.revenueCents +=
          appointment.priceCents;
      }

      if (
        appointment.status ===
        'CONFIRMED'
      ) {
        current.confirmed += 1;
      }

      if (
        appointment.status ===
        'CANCELED'
      ) {
        current.canceled += 1;
      }

      if (
        appointment.status ===
        'NO_SHOW'
      ) {
        current.noShow += 1;
      }

      employeesMap.set(
        appointment.employeeId,
        current,
      );
    }

    const employees =
      Array.from(
        employeesMap.values(),
      )
        .sort(
          (a, b) =>
            b.completed -
            a.completed,
        )
        .map((employee) => ({
          ...employee,

          revenue:
            employee.revenueCents /
            100,
        }));

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

        confirmedCents:
          confirmedRevenueCents,

        confirmed:
          confirmedRevenueCents /
          100,
      },

      clients: {
        attended:
          attendedClientIds.size,
      },

      revenueByDay,

      topServices,

      employees,
    };
  }
}