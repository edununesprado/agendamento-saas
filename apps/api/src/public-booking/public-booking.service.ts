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

          bookingMinAdvanceMinutes:
            true,

          bookingMaxAdvanceDays:
            true,
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

  private getPublicBookingWindow(
    timezone: string,
    bookingMinAdvanceMinutes: number,
    bookingMaxAdvanceDays: number,
  ) {
    const now =
      DateTime.now().setZone(
        timezone,
      );

    return {
      now,

      minimumStart:
        now.plus({
          minutes:
            bookingMinAdvanceMinutes,
        }),

      minimumDate:
        now.startOf(
          'day',
        ),

      maximumDate:
        now
          .plus({
            days:
              bookingMaxAdvanceDays,
          })
          .startOf(
            'day',
          ),
    };
  }

  private validatePublicDate(
    date: string,
    timezone: string,
    bookingMinAdvanceMinutes: number,
    bookingMaxAdvanceDays: number,
  ) {
    const selectedDate =
      DateTime.fromISO(
        date,
        {
          zone:
            timezone,
        },
      );

    if (
      !selectedDate.isValid
    ) {
      throw new BadRequestException(
        'Data inválida',
      );
    }

    const {
      minimumDate,
      maximumDate,
    } =
      this.getPublicBookingWindow(
        timezone,
        bookingMinAdvanceMinutes,
        bookingMaxAdvanceDays,
      );

    const selectedDay =
      selectedDate.startOf(
        'day',
      );

    if (
      selectedDay.toMillis() <
      minimumDate.toMillis()
    ) {
      throw new BadRequestException(
        'Não é possível realizar agendamento público em data anterior a hoje',
      );
    }

    if (
      selectedDay.toMillis() >
      maximumDate.toMillis()
    ) {
      throw new BadRequestException(
        `Agendamentos públicos podem ser feitos com no máximo ${bookingMaxAdvanceDays} dias de antecedência`,
      );
    }

    return selectedDay;
  }

  async findTenant(
    slug: string,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    return {
      name:
        tenant.name,

      slug:
        tenant.slug,

      logoUrl:
        tenant.logoUrl,

      primaryColor:
        tenant.primaryColor,

      phone:
        tenant.phone,

      email:
        tenant.email,

      timezone:
        tenant.timezone,

      bookingMinAdvanceMinutes:
        tenant.bookingMinAdvanceMinutes,

      bookingMaxAdvanceDays:
        tenant.bookingMaxAdvanceDays,
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
        name:
          'asc',
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
          id:
            true,
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
        name:
          'asc',
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

    this.validatePublicDate(
      query.date,
      tenant.timezone,
      tenant.bookingMinAdvanceMinutes,
      tenant.bookingMaxAdvanceDays,
    );

    const availability =
      await this.availabilityService.getAvailableSlots(
        tenant.id,
        query.employeeId,
        query.serviceId,
        query.date,
      );

    const {
      minimumStart,
    } =
      this.getPublicBookingWindow(
        tenant.timezone,
        tenant.bookingMinAdvanceMinutes,
        tenant.bookingMaxAdvanceDays,
      );

    const slots =
      availability.slots.filter(
        (slot) => {
          const slotDateTime =
            DateTime.fromISO(
              `${query.date}T${slot}`,
              {
                zone:
                  tenant.timezone,
              },
            );

          if (
            !slotDateTime.isValid
          ) {
            return false;
          }

          return (
            slotDateTime.toMillis() >=
            minimumStart.toMillis()
          );
        },
      );

    return {
      ...availability,
      slots,
    };
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
          setZone:
            true,
        },
      );

    if (
      !requestedDateTime.isValid
    ) {
      throw new BadRequestException(
        'Data ou horário inválido',
      );
    }

    const nowUtc =
      DateTime.utc();

    const requestedUtc =
      requestedDateTime.toUTC();

    if (
      requestedUtc.toMillis() <=
      nowUtc.toMillis()
    ) {
      throw new BadRequestException(
        'Não é possível realizar agendamento em horário passado',
      );
    }

    const minimumStartUtc =
      nowUtc.plus({
        minutes:
          tenant.bookingMinAdvanceMinutes,
      });

    if (
      requestedUtc.toMillis() <
      minimumStartUtc.toMillis()
    ) {
      throw new BadRequestException(
        `Agendamentos públicos precisam ser feitos com pelo menos ${tenant.bookingMinAdvanceMinutes} minutos de antecedência`,
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

    this.validatePublicDate(
      date,
      tenant.timezone,
      tenant.bookingMinAdvanceMinutes,
      tenant.bookingMaxAdvanceDays,
    );

    const requestedTime =
      localDateTime.toFormat(
        'HH:mm',
      );

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
           * Serializa qualquer operação pública
           * envolvendo este telefone dentro da
           * mesma empresa.
           *
           * Isso também protege contra dois cliques
           * simultâneos no botão de confirmar.
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

          /*
           * Buscamos todos os clientes que tenham
           * o mesmo telefone dentro da empresa.
           *
           * Normalmente haverá apenas um, mas assim
           * a proteção continua funcionando mesmo
           * caso existam registros antigos duplicados.
           */
          const clientsWithPhone =
            await tx.client.findMany({
              where: {
                tenantId:
                  tenant.id,

                phone,
              },

              select: {
                id:
                  true,

                active:
                  true,
              },

              orderBy: {
                createdAt:
                  'asc',
              },
            });

          let client =
            clientsWithPhone.find(
              (existingClient) =>
                existingClient.active,
            );

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
                  id:
                    true,

                  active:
                    true,
                },
              });
          }

          /*
           * Identifica todos os registros de cliente
           * associados ao mesmo telefone.
           *
           * Isso evita que um cliente consiga criar
           * reservas sobrepostas caso existam dois
           * cadastros antigos com o mesmo número.
           */
          const clientIds = [
            ...clientsWithPhone.map(
              (existingClient) =>
                existingClient.id,
            ),

            client.id,
          ].filter(
            (
              id,
              index,
              values,
            ) =>
              values.indexOf(id) ===
              index,
          );

          /*
           * O mesmo cliente não pode manter dois
           * agendamentos ativos que se sobreponham,
           * mesmo que sejam com profissionais
           * diferentes.
           *
           * PENDING e CONFIRMED são considerados
           * compromissos ativos.
           */
          const clientConflict =
            await tx.appointment.findFirst({
              where: {
                tenantId:
                  tenant.id,

                clientId: {
                  in:
                    clientIds,
                },

                status: {
                  in: [
                    'PENDING',
                    'CONFIRMED',
                  ],
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
                id:
                  true,
              },
            });

          if (
            clientConflict
          ) {
            throw new ConflictException(
              'Você já possui um agendamento neste horário',
            );
          }

          /*
           * Serializa as reservas do profissional.
           *
           * Mesmo que duas pessoas tenham escolhido
           * o mesmo horário antes de confirmar,
           * apenas uma poderá gravá-lo.
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
                id:
                  true,
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

              status:
                'PENDING',

              notes:
                notes ||
                undefined,
            },

            select: {
              id:
                true,

              startsAt:
                true,

              endsAt:
                true,

              status:
                true,

              employee: {
                select: {
                  id:
                    true,

                  name:
                    true,
                },
              },

              service: {
                select: {
                  id:
                    true,

                  name:
                    true,

                  durationMin:
                    true,

                  priceCents:
                    true,
                },
              },
            },
          });
        },
      );

    return appointment;
  }
}