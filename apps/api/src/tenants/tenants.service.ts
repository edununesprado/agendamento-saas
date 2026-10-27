
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

  /*
   * Retorna as informações da empresa
   * e indica se existe logo no PostgreSQL.
   *
   * Apenas o ID da imagem é consultado
   * para verificar sua existência.
   * O conteúdo binário não é carregado.
   */
  async findCurrent(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },

      include: {
        logoImage: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    const {
      logoImage,
      ...tenantData
    } = tenant;

    return {
      ...tenantData,
      hasStoredLogo: logoImage !== null,
    };
  }

  /*
   * Atualiza as configurações existentes.
   *
   * Mantém a validação de slug único.
   * Também retorna hasStoredLogo para
   * manter a resposta consistente com
   * GET /tenants/current.
   */
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

    const tenant = await this.prisma.tenant.update({
      where: {
        id: tenantId,
      },

      data,

      include: {
        logoImage: {
          select: {
            id: true,
          },
        },
      },
    });

    const {
      logoImage,
      ...tenantData
    } = tenant;

    return {
      ...tenantData,
      hasStoredLogo: logoImage !== null,
    };
  }
}
