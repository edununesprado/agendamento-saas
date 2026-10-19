import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AvailabilityService } from '../availability/availability.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto.js';
import { PublicEmployeesQueryDto } from './dto/public-employees-query.dto.js';

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  private async findTenantBySlug(
    slug: string,
  ) {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          slug,
        },

        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          primaryColor: true,
          phone: true,
          email: true,
          timezone: true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    return tenant;
  }

  async findTenant(
    slug: string,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    return {
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      primaryColor:
        tenant.primaryColor,
      phone: tenant.phone,
      email: tenant.email,
      timezone: tenant.timezone,
    };
  }

  async findServices(
    slug: string,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    return this.prisma.service.findMany({
      where: {
        tenantId:
          tenant.id,

        active:
          true,
      },

      select: {
        id: true,
        name: true,
        durationMin: true,
        priceCents: true,
      },

      orderBy: {
        name: 'asc',
      },
    });
  }

  async findEmployees(
    slug: string,
    query: PublicEmployeesQueryDto,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    const service =
      await this.prisma.service.findFirst({
        where: {
          id:
            query.serviceId,

          tenantId:
            tenant.id,

          active:
            true,
        },

        select: {
          id: true,
        },
      });

    if (!service) {
      throw new NotFoundException(
        'Serviço não encontrado',
      );
    }

    return this.prisma.employee.findMany({
      where: {
        tenantId:
          tenant.id,

        active:
          true,

        employeeServices: {
          some: {
            serviceId:
              service.id,
          },
        },
      },

      select: {
        id: true,
        name: true,
      },

      orderBy: {
        name: 'asc',
      },
    });
  }

  async findAvailability(
    slug: string,
    query: PublicAvailabilityQueryDto,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    return this.availabilityService.getAvailableSlots(
      tenant.id,
      query.employeeId,
      query.serviceId,
      query.date,
    );
  }
}