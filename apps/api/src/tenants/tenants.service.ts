import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateTenantDto) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: {
        slug: data.slug,
      },
    });

    if (existingTenant) {
      throw new ConflictException('Já existe uma empresa com esse slug');
    }

    return this.prisma.tenant.create({
      data,
    });
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return tenant;
  }

  async update(id: string, data: UpdateTenantDto) {
    await this.findOne(id);

    if (data.slug) {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: {
          slug: data.slug,
        },
      });

      if (existingTenant && existingTenant.id !== id) {
        throw new ConflictException('Já existe uma empresa com esse slug');
      }
    }

    return this.prisma.tenant.update({
      where: {
        id,
      },
      data,
    });
  }
}