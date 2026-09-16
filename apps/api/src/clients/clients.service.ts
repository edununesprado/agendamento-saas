import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { ListClientsQueryDto } from './dto/list-clients-query.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    tenantId: string,
    data: CreateClientDto,
  ) {
    return this.prisma.client.create({
      data: {
        tenantId,
        name: data.name.trim(),
        email: data.email?.trim().toLowerCase(),
        phone: data.phone?.trim(),
        birthDate: data.birthDate
          ? new Date(data.birthDate)
          : undefined,
        notes: data.notes?.trim(),
      },
    });
  }

  async findAll(
    tenantId: string,
    query: ListClientsQueryDto,
  ) {
    const status = query.status ?? 'active';
    const search = query.search?.trim();

    let active: boolean | undefined;

    if (status === 'active') {
      active = true;
    }

    if (status === 'inactive') {
      active = false;
    }

    return this.prisma.client.findMany({
      where: {
        tenantId,

        ...(active !== undefined
          ? {
              active,
            }
          : {}),

        ...(search
          ? {
              OR: [
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: search,
                  },
                },
              ],
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
    const client =
      await this.prisma.client.findFirst({
        where: {
          id,
          tenantId,
        },
      });

    if (!client) {
      throw new NotFoundException(
        'Cliente não encontrado',
      );
    }

    return client;
  }

  async update(
    tenantId: string,
    id: string,
    data: UpdateClientDto,
  ) {
    await this.findOne(tenantId, id);

    return this.prisma.client.update({
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

        ...(data.birthDate !== undefined && {
          birthDate: new Date(data.birthDate),
        }),

        ...(data.notes !== undefined && {
          notes: data.notes.trim(),
        }),
      },
    });
  }

  async remove(
    tenantId: string,
    id: string,
  ) {
    const client =
      await this.findOne(tenantId, id);

    if (!client.active) {
      return client;
    }

    return this.prisma.client.update({
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
    const client =
      await this.findOne(tenantId, id);

    if (client.active) {
      return client;
    }

    return this.prisma.client.update({
      where: {
        id,
      },
      data: {
        active: true,
      },
    });
  }
}