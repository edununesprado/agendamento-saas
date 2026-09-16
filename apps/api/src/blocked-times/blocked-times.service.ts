import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBlockedTimeDto } from './dto/create-blocked-time.dto.js';

@Injectable()
export class BlockedTimesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    tenantId: string,
    employeeId: string,
    data: CreateBlockedTimeDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(
      tenantId,
      employeeId,
    );

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    if (startsAt >= endsAt) {
      throw new BadRequestException(
        'Horário inicial deve ser menor que o horário final',
      );
    }

    const overlapping =
      await this.prisma.blockedTime.findFirst({
        where: {
          tenantId,
          employeeId,

          startsAt: {
            lt: endsAt,
          },

          endsAt: {
            gt: startsAt,
          },
        },
      });

    if (overlapping) {
      throw new BadRequestException(
        'Já existe um bloqueio nesse período',
      );
    }

    return this.prisma.blockedTime.create({
      data: {
        tenantId,
        employeeId,
        startsAt,
        endsAt,
        reason: data.reason?.trim(),
      },
    });
  }

  async findAll(
    tenantId: string,
    employeeId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(
      tenantId,
      employeeId,
    );

    return this.prisma.blockedTime.findMany({
      where: {
        tenantId,
        employeeId,
      },

      orderBy: {
        startsAt: 'asc',
      },
    });
  }

  async remove(
    tenantId: string,
    employeeId: string,
    blockedTimeId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(
      tenantId,
      employeeId,
    );

    const blockedTime =
      await this.prisma.blockedTime.findFirst({
        where: {
          id: blockedTimeId,
          tenantId,
          employeeId,
        },
      });

    if (!blockedTime) {
      throw new NotFoundException(
        'Bloqueio não encontrado',
      );
    }

    await this.prisma.blockedTime.delete({
      where: {
        id: blockedTimeId,
      },
    });

    return {
      message: 'Bloqueio removido com sucesso',
    };
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
}