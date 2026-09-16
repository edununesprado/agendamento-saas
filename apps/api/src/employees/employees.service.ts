import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { SetEmployeeServicesDto } from './dto/set-employee-services.dto.js';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    tenantId: string,
    data: CreateEmployeeDto,
  ) {
    return this.prisma.employee.create({
      data: {
        tenantId,
        name: data.name.trim(),
        email: data.email?.trim().toLowerCase(),
        phone: data.phone?.trim(),
        avatarUrl: data.avatarUrl?.trim(),
      },
    });
  }

  async findAll(
    tenantId: string,
    query: ListEmployeesQueryDto,
  ) {
    const status = query.status ?? 'active';

    let active: boolean | undefined;

    if (status === 'active') {
      active = true;
    }

    if (status === 'inactive') {
      active = false;
    }

    return this.prisma.employee.findMany({
      where: {
        tenantId,
        ...(active !== undefined
          ? {
              active,
            }
          : {}),
      },

      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(
    tenantId: string,
    id: string,
  ) {
    const employee =
      await this.prisma.employee.findFirst({
        where: {
          id,
          tenantId,
        },
      });

    if (!employee) {
      throw new NotFoundException(
        'Funcionário não encontrado',
      );
    }

    return employee;
  }

  async findServices(
  tenantId: string,
  employeeId: string,
) {
  await this.findOne(tenantId, employeeId);

  const employeeServices =
    await this.prisma.employeeService.findMany({
      where: {
        employeeId,
        employee: {
          tenantId,
        },
      },

      include: {
        service: true,
      },

      orderBy: {
        service: {
          name: 'asc',
        },
      },
    });

  return employeeServices.map(
    (employeeService) => employeeService.service,
  );
}

async setServices(
  tenantId: string,
  employeeId: string,
  data: SetEmployeeServicesDto,
) {
  await this.findOne(tenantId, employeeId);

  const uniqueServiceIds = [
    ...new Set(data.serviceIds),
  ];

  if (uniqueServiceIds.length > 0) {
    const services =
      await this.prisma.service.findMany({
        where: {
          id: {
            in: uniqueServiceIds,
          },
          tenantId,
          active: true,
        },
      });

    if (
      services.length !== uniqueServiceIds.length
    ) {
      throw new BadRequestException(
        'Um ou mais serviços são inválidos, estão inativos ou não pertencem à empresa',
      );
    }
  }

  await this.prisma.$transaction(async (tx) => {
    await tx.employeeService.deleteMany({
      where: {
        employeeId,
      },
    });

    if (uniqueServiceIds.length > 0) {
      await tx.employeeService.createMany({
        data: uniqueServiceIds.map(
          (serviceId) => ({
            employeeId,
            serviceId,
          }),
        ),
      });
    }
  });

  return this.findServices(
    tenantId,
    employeeId,
  );
}

  async update(
    tenantId: string,
    id: string,
    data: UpdateEmployeeDto,
  ) {
    await this.findOne(tenantId, id);

    return this.prisma.employee.update({
      where: {
        id,
      },

      data: {
        ...(data.name !== undefined && {
          name: data.name.trim(),
        }),

        ...(data.email !== undefined && {
          email: data.email.trim().toLowerCase(),
        }),

        ...(data.phone !== undefined && {
          phone: data.phone.trim(),
        }),

        ...(data.avatarUrl !== undefined && {
          avatarUrl: data.avatarUrl.trim(),
        }),
      },
    });
  }

  async remove(
    tenantId: string,
    id: string,
  ) {
    const employee =
      await this.findOne(tenantId, id);

    if (!employee.active) {
      return employee;
    }

    return this.prisma.employee.update({
      where: {
        id,
      },

      data: {
        active: false,
      },
    });
  }

  async restore(
    tenantId: string,
    id: string,
  ) {
    const employee =
      await this.findOne(tenantId, id);

    if (employee.active) {
      return employee;
    }

    return this.prisma.employee.update({
      where: {
        id,
      },

      data: {
        active: true,
      },
    });
  }
}