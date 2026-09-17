import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import { PrismaService } from '../prisma/prisma.service.js';
import { SetAvailabilityDto } from './dto/set-availability.dto.js';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getAvailableSlots(
    tenantId: string,
    employeeId: string,
    serviceId: string,
    date: string,
    excludeAppointmentId?: string,
  ) {
    // 1. Funcionário
    const employee =
      await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          tenantId,
          active: true,
        },
      });

    if (!employee) {
      throw new NotFoundException(
        'Funcionário não encontrado ou inativo',
      );
    }

    // 2. Serviço
    const service =
      await this.prisma.service.findFirst({
        where: {
          id: serviceId,
          tenantId,
          active: true,
        },
      });

    if (!service) {
      throw new NotFoundException(
        'Serviço não encontrado ou inativo',
      );
    }

    // 3. Verifica se o funcionário realiza o serviço
    const employeeService =
      await this.prisma.employeeService.findFirst({
        where: {
          employeeId,
          serviceId,

          employee: {
            tenantId,
          },

          service: {
            tenantId,
          },
        },
      });

    if (!employeeService) {
      throw new BadRequestException(
        'Este funcionário não realiza o serviço informado',
      );
    }

    // 4. Empresa / timezone
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

    // 5. Data no timezone da empresa
    const selectedDate =
      DateTime.fromISO(date, {
        zone: tenant.timezone,
      });

    if (!selectedDate.isValid) {
      throw new BadRequestException(
        'Data inválida',
      );
    }

    // 6. Dia da semana
    const dayOfWeek =
      this.getPrismaDayOfWeek(
        selectedDate.weekday,
      );

    // 7. Jornada do funcionário
    const availabilityRules =
      await this.prisma.availabilityRule.findMany({
        where: {
          tenantId,
          employeeId,
          dayOfWeek,
        },

        orderBy: {
          startMinute: 'asc',
        },
      });

    // Limites do dia
    const dayStart =
      selectedDate.startOf('day');

    const dayEnd =
      selectedDate.endOf('day');

    // 8. Bloqueios
    const blockedTimes =
      await this.prisma.blockedTime.findMany({
        where: {
          tenantId,
          employeeId,

          startsAt: {
            lt: dayEnd.toJSDate(),
          },

          endsAt: {
            gt: dayStart.toJSDate(),
          },
        },

        orderBy: {
          startsAt: 'asc',
        },
      });

    // 9. Agendamentos já existentes
    const appointments =
  await this.prisma.appointment.findMany({
    where: {
      tenantId,
      employeeId,

      status: {
        not: 'CANCELED',
      },

      ...(excludeAppointmentId
        ? {
            id: {
              not: excludeAppointmentId,
            },
          }
        : {}),

      startsAt: {
        lt: dayEnd.toJSDate(),
      },

      endsAt: {
        gt: dayStart.toJSDate(),
      },
    },

    orderBy: {
      startsAt: 'asc',
    },
  });

    // Intervalo entre horários oferecidos
    const slotIntervalMin = 30;

    const slots: string[] = [];

    // 10. Percorre os períodos de trabalho
    for (const rule of availabilityRules) {
      let currentStart =
        rule.startMinute;

      while (
        currentStart +
          service.durationMin <=
        rule.endMinute
      ) {
        const currentEnd =
          currentStart +
          service.durationMin;

        const slotStart =
          selectedDate
            .startOf('day')
            .plus({
              minutes: currentStart,
            });

        const slotEnd =
          selectedDate
            .startOf('day')
            .plus({
              minutes: currentEnd,
            });

        // 11. Verifica bloqueios
        const hasBlockedTime =
          blockedTimes.some(
            (blockedTime) => {
              const blockedStart =
                DateTime.fromJSDate(
                  blockedTime.startsAt,
                  {
                    zone: tenant.timezone,
                  },
                );

              const blockedEnd =
                DateTime.fromJSDate(
                  blockedTime.endsAt,
                  {
                    zone: tenant.timezone,
                  },
                );

              return (
                slotStart.toMillis() <
                  blockedEnd.toMillis() &&
                slotEnd.toMillis() >
                  blockedStart.toMillis()
              );
            },
          );

        // 12. Verifica agendamentos
        const hasAppointment =
          appointments.some(
            (appointment) => {
              const appointmentStart =
                DateTime.fromJSDate(
                  appointment.startsAt,
                  {
                    zone: tenant.timezone,
                  },
                );

              const appointmentEnd =
                DateTime.fromJSDate(
                  appointment.endsAt,
                  {
                    zone: tenant.timezone,
                  },
                );

              return (
                slotStart.toMillis() <
                  appointmentEnd.toMillis() &&
                slotEnd.toMillis() >
                  appointmentStart.toMillis()
              );
            },
          );

        // 13. Adiciona somente se estiver livre
        if (
          !hasBlockedTime &&
          !hasAppointment
        ) {
          slots.push(
            slotStart.toFormat('HH:mm'),
          );
        }

        // IMPORTANTE:
        // sempre avança o horário,
        // mesmo quando existe bloqueio ou agendamento.
        currentStart +=
          slotIntervalMin;
      }
    }

    return {
      date,
      employeeId,
      serviceId,

      employee: {
        id: employee.id,
        name: employee.name,
      },

      service: {
        id: service.id,
        name: service.name,
        durationMin:
          service.durationMin,
        priceCents:
          service.priceCents,
      },

      timezone:
        tenant.timezone,

      slots,
    };
  }

  async findByEmployee(
    tenantId: string,
    employeeId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(
      tenantId,
      employeeId,
    );

    const rules =
      await this.prisma.availabilityRule.findMany({
        where: {
          tenantId,
          employeeId,
        },

        orderBy: [
          {
            dayOfWeek: 'asc',
          },
          {
            startMinute: 'asc',
          },
        ],
      });

    return rules.map((rule) => ({
      id: rule.id,
      dayOfWeek: rule.dayOfWeek,

      start: this.minuteToTime(
        rule.startMinute,
      ),

      end: this.minuteToTime(
        rule.endMinute,
      ),
    }));
  }

  async setAvailability(
    tenantId: string,
    employeeId: string,
    data: SetAvailabilityDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(
      tenantId,
      employeeId,
    );

    this.validateDays(data);

    const rows =
      data.days.flatMap((day) =>
        day.intervals.map(
          (interval) => ({
            tenantId,
            employeeId,

            dayOfWeek:
              day.dayOfWeek,

            startMinute:
              this.timeToMinute(
                interval.start,
              ),

            endMinute:
              this.timeToMinute(
                interval.end,
              ),
          }),
        ),
      );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.availabilityRule.deleteMany({
          where: {
            tenantId,
            employeeId,
          },
        });

        if (rows.length > 0) {
          await tx.availabilityRule.createMany({
            data: rows,
          });
        }
      },
    );

    return this.findByEmployee(
      tenantId,
      employeeId,
    );
  }

  private validateDays(
    data: SetAvailabilityDto,
  ) {
    const receivedDays =
      new Set<string>();

    for (const day of data.days) {
      if (
        receivedDays.has(
          day.dayOfWeek,
        )
      ) {
        throw new BadRequestException(
          `O dia ${day.dayOfWeek} foi informado mais de uma vez`,
        );
      }

      receivedDays.add(
        day.dayOfWeek,
      );

      const intervals =
        day.intervals
          .map((interval) => ({
            start:
              this.timeToMinute(
                interval.start,
              ),

            end:
              this.timeToMinute(
                interval.end,
              ),
          }))
          .sort(
            (a, b) =>
              a.start - b.start,
          );

      for (
        const interval of intervals
      ) {
        if (
          interval.start >=
          interval.end
        ) {
          throw new BadRequestException(
            `Horário inicial deve ser menor que o horário final em ${day.dayOfWeek}`,
          );
        }
      }

      for (
        let index = 1;
        index < intervals.length;
        index++
      ) {
        const previous =
          intervals[index - 1];

        const current =
          intervals[index];

        if (
          current.start <
          previous.end
        ) {
          throw new BadRequestException(
            `Existem horários sobrepostos em ${day.dayOfWeek}`,
          );
        }
      }
    }
  }

  private async ensureEmployeeBelongsToTenant(
    tenantId: string,
    employeeId: string,
  ) {
    const employee =
      await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          tenantId,
        },

        select: {
          id: true,
        },
      });

    if (!employee) {
      throw new NotFoundException(
        'Funcionário não encontrado',
      );
    }
  }

  private timeToMinute(
    value: string,
  ) {
    const [hour, minute] =
      value
        .split(':')
        .map(Number);

    return (
      hour * 60 +
      minute
    );
  }

  private minuteToTime(
    value: number,
  ) {
    const hour =
      Math.floor(value / 60);

    const minute =
      value % 60;

    return `${String(hour).padStart(
      2,
      '0',
    )}:${String(
      minute,
    ).padStart(2, '0')}`;
  }

  private getPrismaDayOfWeek(
    weekday: number,
  ):
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY' {
    switch (weekday) {
      case 1:
        return 'MONDAY';

      case 2:
        return 'TUESDAY';

      case 3:
        return 'WEDNESDAY';

      case 4:
        return 'THURSDAY';

      case 5:
        return 'FRIDAY';

      case 6:
        return 'SATURDAY';

      case 7:
        return 'SUNDAY';

      default:
        throw new BadRequestException(
          'Dia da semana inválido',
        );
    }
  }
}