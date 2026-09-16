import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  SetAvailabilityDto,
} from './dto/set-availability.dto.js';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

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
      start: this.minuteToTime(rule.startMinute),
      end: this.minuteToTime(rule.endMinute),
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

    const rows = data.days.flatMap((day) =>
      day.intervals.map((interval) => ({
        tenantId,
        employeeId,
        dayOfWeek: day.dayOfWeek,
        startMinute: this.timeToMinute(interval.start),
        endMinute: this.timeToMinute(interval.end),
      })),
    );

    await this.prisma.$transaction(async (tx) => {
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
    });

    return this.findByEmployee(
      tenantId,
      employeeId,
    );
  }

  private validateDays(
    data: SetAvailabilityDto,
  ) {
    const receivedDays = new Set<string>();

    for (const day of data.days) {
      if (receivedDays.has(day.dayOfWeek)) {
        throw new BadRequestException(
          `O dia ${day.dayOfWeek} foi informado mais de uma vez`,
        );
      }

      receivedDays.add(day.dayOfWeek);

      const intervals = day.intervals
        .map((interval) => ({
          start: this.timeToMinute(interval.start),
          end: this.timeToMinute(interval.end),
        }))
        .sort((a, b) => a.start - b.start);

      for (const interval of intervals) {
        if (interval.start >= interval.end) {
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
        const previous = intervals[index - 1];
        const current = intervals[index];

        if (current.start < previous.end) {
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
    const [hour, minute] = value
      .split(':')
      .map(Number);

    return hour * 60 + minute;
  }

  private minuteToTime(
    value: number,
  ) {
    const hour = Math.floor(value / 60);
    const minute = value % 60;

    return `${String(hour).padStart(2, '0')}:${String(
      minute,
    ).padStart(2, '0')}`;
  }
}