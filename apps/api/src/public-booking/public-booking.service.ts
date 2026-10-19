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

const PUBLIC_MIN_ADVANCE_MINUTES =
  60;

const PUBLIC_MAX_ADVANCE_DAYS =
  7;

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

  /*
   * Janela permitida para
   * agendamento público.
   *
   * Mínimo:
   * 60 minutos a partir de agora.
   *
   * Máximo:
   * até 7 dias à frente.
   */
  private getPublicBookingWindow(
    timezone: string,
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
            PUBLIC_MIN_ADVANCE_MINUTES,
        }),

      minimumDate:
        now.startOf(
          'day',
        ),

      maximumDate:
        now
          .plus({
            days:
              PUBLIC_MAX_ADVANCE_DAYS,
          })
          .startOf(
            'day',
          ),
    };
  }

  private validatePublicDate(
    date: string,
    timezone: string,
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
        'Agendamentos públicos podem ser feitos com no máximo 7 dias de antecedência',
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

    /*
     * Impede consulta pública
     * para datas fora da janela.
     */
    this.validatePublicDate(
      query.date,
      tenant.timezone,
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
      );

    /*
     * Remove horários com menos
     * de 60 minutos de antecedência.
     *
     * Isso também funciona caso
     * o período mínimo ultrapasse
     * a meia-noite.
     */
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

    const nowUtc =
      DateTime.utc();

    const requestedUtc =
      requestedDateTime.toUTC();

    /*
     * Mantemos a validação
     * original de horário passado.
     */
    if (
      requestedUtc.toMillis() <=
      nowUtc.toMillis()
    ) {
      throw new BadRequestException(
        'Não é possível realizar agendamento em horário passado',
      );
    }

    /*
     * Segurança do backend:
     * mesmo que alguém tente burlar
     * o frontend, o agendamento precisa
     * ter no mínimo 60 minutos.
     */
    const minimumStartUtc =
      nowUtc.plus({
        minutes:
          PUBLIC_MIN_ADVANCE_MINUTES,
      });

    if (
      requestedUtc.toMillis() <
      minimumStartUtc.toMillis()
    ) {
      throw new BadRequestException(
        'Agendamentos públicos precisam ser feitos com pelo menos 60 minutos de antecedência',
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

    /*
     * Segurança do backend:
     * máximo de 7 dias.
     */
    this.validatePublicDate(
      date,
      tenant.timezone,
    );

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