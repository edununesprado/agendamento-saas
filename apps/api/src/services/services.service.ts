import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { ListServicesQueryDto } from './dto/list-services-query.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    tenantId: string,
    data: CreateServiceDto,
  ) {
    const name = data.name.trim();

    const existingService =
      await this.prisma.service.findUnique({
        where: {
          tenantId_name: {
            tenantId,
            name,
          },
        },
      });

    if (existingService) {
      throw new ConflictException(
        existingService.active
          ? 'Já existe um serviço com esse nome'
          : 'Já existe um serviço inativo com esse nome',
      );
    }

    return this.prisma.service.create({
      data: {
        tenantId,
        name,
        description: data.description?.trim(),
        durationMin: data.durationMin,
        priceCents: data.priceCents,
      },
    });
  }

  async findAll(
    tenantId: string,
    query: ListServicesQueryDto,
  ) {
    const status = query.status ?? 'active';

    let active: boolean | undefined;

    if (status === 'active') {
      active = true;
    }

    if (status === 'inactive') {
      active = false;
    }

    return this.prisma.service.findMany({
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
    const service =
      await this.prisma.service.findFirst({
        where: {
          id,
          tenantId,
        },
      });

    if (!service) {
      throw new NotFoundException(
        'Serviço não encontrado',
      );
    }

    return service;
  }

  async update(
    tenantId: string,
    id: string,
    data: UpdateServiceDto,
  ) {
    await this.findOne(tenantId, id);

    const updateData = {
      ...data,
    };

    if (data.name !== undefined) {
      const name = data.name.trim();

      const existingService =
        await this.prisma.service.findUnique({
          where: {
            tenantId_name: {
              tenantId,
              name,
            },
          },
        });

      if (
        existingService &&
        existingService.id !== id
      ) {
        throw new ConflictException(
          'Já existe outro serviço com esse nome',
        );
      }

      updateData.name = name;
    }

    if (data.description !== undefined) {
      updateData.description =
        data.description.trim();
    }

    return this.prisma.service.update({
      where: {
        id,
      },
      data: updateData,
    });
  }

  async remove(
    tenantId: string,
    id: string,
  ) {
    const service =
      await this.findOne(tenantId, id);

    if (!service.active) {
      return service;
    }

    return this.prisma.service.update({
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
    const service =
      await this.findOne(tenantId, id);

    if (service.active) {
      return service;
    }

    return this.prisma.service.update({
      where: {
        id,
      },
      data: {
        active: true,
      },
    });
  }
}