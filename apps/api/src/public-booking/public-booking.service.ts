import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import { AvailabilityService } from '../availability/availability.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto.js';
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

  private normalizePhone(
    value: string,
  ) {
    return value.replace(
      /\D/g,
      '',
    );
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

  async createAppointment(
    slug: string,
    data: CreatePublicAppointmentDto,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    const requestedDateTime =
      DateTime.fromISO(
        data.startsAt,
        {
          setZone: true,
        },
      );

    if (
      !requestedDateTime.isValid
    ) {
      throw new BadRequestException(
        'Data ou horário inválido',
      );
    }

    if (
      requestedDateTime
        .toUTC()
        .toMillis() <=
      DateTime.utc().toMillis()
    ) {
      throw new BadRequestException(
        'Não é possível realizar agendamento em horário passado',
      );
    }

    const localDateTime =
      requestedDateTime.setZone(
        tenant.timezone,
      );

    const date =
      localDateTime.toISODate();

    if (!date) {
      throw new BadRequestException(
        'Data inválida',
      );
    }

    const requestedTime =
      localDateTime.toFormat(
        'HH:mm',
      );

    /*
     * Esta chamada já verifica:
     *
     * - funcionário ativo;
     * - serviço ativo;
     * - mesma empresa;
     * - funcionário realiza serviço;
     * - jornada;
     * - bloqueios;
     * - agendamentos existentes.
     */
    const availability =
      await this.availabilityService.getAvailableSlots(
        tenant.id,
        data.employeeId,
        data.serviceId,
        date,
      );

    if (
      !availability.slots.includes(
        requestedTime,
      )
    ) {
      throw new ConflictException(
        'O horário informado não está mais disponível',
      );
    }

    const startsAt =
      requestedDateTime
        .toUTC()
        .toJSDate();

    const endsAt =
      requestedDateTime
        .plus({
          minutes:
            availability.service.durationMin,
        })
        .toUTC()
        .toJSDate();

    const phone =
      this.normalizePhone(
        data.client.phone,
      );

    if (
      phone.length < 10 ||
      phone.length > 13
    ) {
      throw new BadRequestException(
        'Telefone inválido',
      );
    }

    const clientName =
      data.client.name.trim();

    const email =
      data.client.email
        ?.trim()
        .toLowerCase();

    const notes =
      data.notes?.trim();

    const appointment =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * Serializa a criação/reutilização
           * do cliente público pelo telefone.
           */
          await tx.$queryRaw<
            Array<{
              lock_value: number;
            }>
          >`
            SELECT 1::int AS lock_value
            FROM pg_advisory_xact_lock(
              hashtext(${tenant.id}),
              hashtext(${`client:${phone}`})
            )
          `;

          let client =
            await tx.client.findFirst({
              where: {
                tenantId:
                  tenant.id,

                phone,

                active:
                  true,
              },

              select: {
                id: true,
              },
            });

          if (!client) {
            client =
              await tx.client.create({
                data: {
                  tenantId:
                    tenant.id,

                  name:
                    clientName,

                  phone,

                  email,
                },

                select: {
                  id: true,
                },
              });
          }

          /*
           * Trava o profissional.
           *
           * Mesmo que duas pessoas tenham
           * escolhido o mesmo horário antes
           * de apertar Confirmar, apenas uma
           * poderá gravar o agendamento.
           */
          await tx.$queryRaw<
            Array<{
              lock_value: number;
            }>
          >`
            SELECT 1::int AS lock_value
            FROM pg_advisory_xact_lock(
              hashtext(${tenant.id}),
              hashtext(${data.employeeId})
            )
          `;

          const conflictingAppointment =
            await tx.appointment.findFirst({
              where: {
                tenantId:
                  tenant.id,

                employeeId:
                  data.employeeId,

                status: {
                  not:
                    'CANCELED',
                },

                startsAt: {
                  lt:
                    endsAt,
                },

                endsAt: {
                  gt:
                    startsAt,
                },
              },

              select: {
                id: true,
              },
            });

          if (
            conflictingAppointment
          ) {
            throw new ConflictException(
              'Este horário acabou de ser ocupado',
            );
          }

          return tx.appointment.create({
            data: {
              tenantId:
                tenant.id,

              employeeId:
                data.employeeId,

              serviceId:
                data.serviceId,

              clientId:
                client.id,

              startsAt,
              endsAt,

              durationMin:
                availability.service.durationMin,

              priceCents:
                availability.service.priceCents,

              /*
               * Público começa aguardando
               * confirmação da empresa.
               */
              status:
                'PENDING',

              notes:
                notes || undefined,
            },

            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,

              employee: {
                select: {
                  id: true,
                  name: true,
                },
              },

              service: {
                select: {
                  id: true,
                  name: true,
                  durationMin: true,
                  priceCents: true,
                },
              },
            },
          });
        },
      );

    /*
     * Não devolvemos Client completo.
     * Assim telefone e e-mail do cliente
     * não aparecem na resposta pública.
     */
    return appointment;
  }
}