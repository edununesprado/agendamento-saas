import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findCurrent(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    return tenant;
  }

  async updateCurrent(
    tenantId: string,
    data: UpdateTenantDto,
  ) {
    await this.findCurrent(tenantId);

    if (data.slug) {
      const existingTenant =
        await this.prisma.tenant.findUnique({
          where: {
            slug: data.slug,
          },
        });

      if (
        existingTenant &&
        existingTenant.id !== tenantId
      ) {
        throw new ConflictException(
          'Já existe uma empresa com esse slug',
        );
      }
    }

    return this.prisma.tenant.update({
      where: {
        id: tenantId,
      },
      data,
    });
  }
}