
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import {
  recordAppointmentAudit,
} from '../appointments/appointment-audit.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto.js';
import { PublicAvailabilityQueryDto } from './dto/public-availability-query.dto.js';
import { PublicEmployeesQueryDto } from './dto/public-employees-query.dto.js';

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationsService: NotificationsService,
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

          logoImage: {
            select: {
              id: true,
            },
          },

          primaryColor: true,
          phone: true,
          email: true,
          timezone: true,
          bookingMinAdvanceMinutes: true,
          bookingMaxAdvanceDays: true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    return tenant;
  }

  /*
   * Normaliza o telefone brasileiro.
   *
   * Aceita o código internacional 55,
   * mas armazena os novos telefones
   * no formato nacional.
   */
  private normalizePhone(
    value: string,
  ) {
    const digits = value.replace(
      /\D/g,
      '',
    );

    const phone =
      digits.startsWith('55') &&
      (
        digits.length === 12 ||
        digits.length === 13
      )
        ? digits.slice(2)
        : digits;

    if (
      !/^[1-9]\d{9,10}$/.test(phone)
    ) {
      throw new BadRequestException(
        'Telefone inválido',
      );
    }

    return phone;
  }

  /*
   * Considera os formatos nacional
   * e internacional usados em
   * cadastros anteriores.
   */
  private getPhoneLookupValues(
    phone: string,
  ) {
    return [
      phone,
      `55${phone}`,
    ];
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
        now.startOf('day'),

      maximumDate:
        now
          .plus({
            days:
              bookingMaxAdvanceDays,
          })
          .startOf('day'),
    };
  }

  private validatePublicDate(
    date: string,
    timezone: string,
    bookingMinAdvanceMinutes: number,
    bookingMaxAdvanceDays: number,
  ) {
    const selectedDate =
      DateTime.fromISO(date, {
        zone: timezone,
      });

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
      selectedDate.startOf('day');

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

  /*
   * Informações públicas da empresa.
   */
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
      hasStoredLogo: tenant.logoImage !== null,
      primaryColor: tenant.primaryColor,
      phone: tenant.phone,
      email: tenant.email,
      timezone: tenant.timezone,
      bookingMinAdvanceMinutes:
        tenant.bookingMinAdvanceMinutes,
      bookingMaxAdvanceDays:
        tenant.bookingMaxAdvanceDays,
    };
  }

  /*
   * Serviços disponíveis na empresa.
   */
  async findServices(
    slug: string,
  ) {
    const tenant =
      await this.findTenantBySlug(
        slug,
      );

    return this.prisma.service.findMany({
      where: {
        tenantId: tenant.id,
        active: true,
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

  /*
   * Profissionais ativos vinculados
   * ao serviço selecionado.
   */
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
          id: query.serviceId,
          tenantId: tenant.id,
          active: true,
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
        tenantId: tenant.id,
        active: true,

        employeeServices: {
          some: {
            serviceId: service.id,
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

  /*
   * Disponibilidade pública.
   *
   * Mantém a antecedência mínima
   * e os limites configurados
   * para a empresa.
   */
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

  /*
   * ETAPA 6.1 — CRIAÇÃO PÚBLICA
   *
   * Operações na mesma transação:
   *
   * 1. Identificar ou criar cliente.
   * 2. Verificar conflitos do cliente.
   * 3. Verificar conflitos do profissional.
   * 4. Criar agendamento PENDING.
   * 5. Criar notificação na Outbox.
   * 6. Criar histórico de auditoria.
   *
   * Se alguma operação falhar,
   * o PostgreSQL desfaz a transação.
   */
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

    const nowUtc = DateTime.utc();

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

    /*
     * Normalização dos dados recebidos.
     */
    const phone =
      this.normalizePhone(
        data.client.phone,
      );

    const phoneLookupValues =
      this.getPhoneLookupValues(
        phone,
      );

    const clientName =
      data.client.name.trim();

    const email =
      data.client.email
        ?.trim()
        .toLowerCase();

    const notes =
      data.notes?.trim();

    /*
     * TRANSAÇÃO POSTGRESQL
     *
     * A partir deste ponto, todas as
     * alterações são atômicas.
     */
    const appointment =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * Bloqueio por empresa e telefone.
           *
           * Impede que duas requisições
           * simultâneas criem registros
           * duplicados do mesmo cliente.
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
           * Procura telefones nacionais e
           * cadastros antigos com prefixo 55.
           */
          const clientsWithPhone =
            await tx.client.findMany({
              where: {
                tenantId: tenant.id,

                phone: {
                  in: phoneLookupValues,
                },
              },

              select: {
                id: true,
                name: true,
                email: true,
                active: true,
              },

              orderBy: {
                createdAt: 'asc',
              },
            });

          let client =
            clientsWithPhone.find(
              (existingClient) =>
                existingClient.active,
            );

          /*
           * Se não houver cliente ativo,
           * cria um novo cadastro.
           */
          if (!client) {
            client =
              await tx.client.create({
                data: {
                  tenantId: tenant.id,
                  name: clientName,
                  phone,
                  email,
                },

                select: {
                  id: true,
                  name: true,
                  email: true,
                  active: true,
                },
              });
          }

          /*
           * Inclui possíveis cadastros
           * antigos do mesmo telefone.
           *
           * Garante que eles também sejam
           * considerados na verificação
           * de conflitos de horário.
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
           * O cliente não pode possuir
           * dois agendamentos PENDING ou
           * CONFIRMED no mesmo horário,
           * mesmo com profissionais
           * diferentes.
           */
          const clientConflict =
            await tx.appointment.findFirst({
              where: {
                tenantId: tenant.id,

                clientId: {
                  in: clientIds,
                },

                status: {
                  in: [
                    'PENDING',
                    'CONFIRMED',
                  ],
                },

                startsAt: {
                  lt: endsAt,
                },

                endsAt: {
                  gt: startsAt,
                },
              },

              select: {
                id: true,
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
           * Bloqueio por empresa e
           * profissional.
           *
           * Impede que duas pessoas
           * reservem o mesmo horário
           * simultaneamente.
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
                tenantId: tenant.id,

                employeeId:
                  data.employeeId,

                status: {
                  not: 'CANCELED',
                },

                startsAt: {
                  lt: endsAt,
                },

                endsAt: {
                  gt: startsAt,
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

          /*
           * Cria o agendamento público.
           *
           * O status inicial permanece
           * PENDING, como anteriormente.
           */
          const createdAppointment =
            await tx.appointment.create({
              data: {
                tenantId: tenant.id,

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

                status: 'PENDING',

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

          /*
           * TRANSACTIONAL OUTBOX
           *
           * Registra a solicitação de
           * agendamento na fila de
           * notificações usando o mesmo tx.
           */
          await this.notificationsService.notifyAppointmentRequested(
            {
              tenantId: tenant.id,

              appointmentId:
                createdAppointment.id,

              clientName:
                client.name,

              clientEmail:
                client.email,

              tenantName:
                tenant.name,

              serviceName:
                createdAppointment.service.name,

              employeeName:
                createdAppointment.employee.name,

              startsAt:
                createdAppointment.startsAt,

              timezone:
                tenant.timezone,
            },

            {
              client: tx,
              throwOnError: true,
            },
          );

          /*
           * ETAPA 6.1 — AUDITORIA PÚBLICA
           *
           * Novo registro inserido na
           * mesma transação do Appointment
           * e da NotificationDelivery.
           *
           * Como não existe login de usuário
           * nessa página, o responsável é
           * identificado como PUBLIC.
           *
           * Não gravamos nome, telefone,
           * e-mail ou anotações do cliente
           * no snapshot de auditoria.
           */
          await recordAppointmentAudit(
            tx,
            {
              tenantId:
                tenant.id,

              appointmentId:
                createdAppointment.id,

              action:
                'CREATED',

              actor: {
                type: 'PUBLIC',
              },

              after: {
                status:
                  createdAppointment.status,

                startsAt:
                  createdAppointment.startsAt.toISOString(),

                endsAt:
                  createdAppointment.endsAt.toISOString(),

                employeeId:
                  createdAppointment.employee.id,

                serviceId:
                  createdAppointment.service.id,
              },
            },
          );

          /*
           * Caso a gravação da auditoria
           * falhe, toda a transação será
           * revertida automaticamente.
           */
          return createdAppointment;
        },
      );

    return appointment;
  }
}
