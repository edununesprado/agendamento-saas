import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import { AvailabilityService } from '../availability/availability.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Descobre qual Employee está vinculado
   * à membership de um usuário STAFF.
   */
  private async getStaffEmployeeId(
    tenantId: string,
    membershipId: string,
  ) {
    const employee =
      await this.prisma.employee.findFirst({
        where: {
          tenantId,
          membershipId,
        },

        select: {
          id: true,
        },
      });

    if (!employee) {
      throw new ForbiddenException(
        'Seu usuário STAFF não está vinculado a um funcionário',
      );
    }

    return employee.id;
  }

  /**
   * Busca um agendamento da empresa sem
   * aplicar regras específicas de STAFF.
   *
   * Usado internamente pelas operações de
   * alteração que já são protegidas pelo
   * RolesGuard no controller.
   */
  private async findOneForTenant(
    tenantId: string,
    id: string,
  ) {
    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          tenantId,
        },

        include: {
          employee: true,
          service: true,
          client: true,
        },
      });

    if (!appointment) {
      throw new NotFoundException(
        'Agendamento não encontrado',
      );
    }

    return appointment;
  }

  async create(
    tenantId: string,
    data: CreateAppointmentDto,
  ) {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          id: tenantId,
        },

        select: {
          timezone: true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    const client =
      await this.prisma.client.findFirst({
        where: {
          id: data.clientId,
          tenantId,
          active: true,
        },
      });

    if (!client) {
      throw new NotFoundException(
        'Cliente não encontrado ou inativo',
      );
    }

    const requestedDateTime =
      DateTime.fromISO(
        data.startsAt,
        {
          setZone: true,
        },
      );

    if (!requestedDateTime.isValid) {
      throw new BadRequestException(
        'Data ou horário inválido',
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

    const availability =
      await this.availabilityService.getAvailableSlots(
        tenantId,
        data.employeeId,
        data.serviceId,
        date,
      );

    if (
      !availability.slots.includes(
        requestedTime,
      )
    ) {
      throw new BadRequestException(
        'O horário informado não está disponível',
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

    return this.prisma.$transaction(
      async (tx) => {
        /**
         * Impede duas requisições simultâneas
         * de criarem horários sobrepostos para
         * o mesmo profissional.
         */
        await tx.$queryRaw<
          Array<{
            lock_value: number;
          }>
        >`
          SELECT 1::int AS lock_value
          FROM pg_advisory_xact_lock(
            hashtext(${tenantId}),
            hashtext(${data.employeeId})
          )
        `;

        const conflictingAppointment =
          await tx.appointment.findFirst({
            where: {
              tenantId,

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
            tenantId,

            employeeId:
              data.employeeId,

            serviceId:
              data.serviceId,

            clientId:
              data.clientId,

            startsAt,
            endsAt,

            durationMin:
              availability.service.durationMin,

            priceCents:
              availability.service.priceCents,

            // Agendamento criado pelo painel
            // interno já começa confirmado.
            status: 'CONFIRMED',

            notes:
              data.notes?.trim(),
          },

          include: {
            employee: true,
            service: true,
            client: true,
          },
        });
      },
    );
  }

  async findAll(
    tenantId: string,
    query: ListAppointmentsQueryDto,
    membershipId: string,
    role: string,
  ) {
    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          id: tenantId,
        },

        select: {
          timezone: true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

    if (
      query.date &&
      (
        query.startDate ||
        query.endDate
      )
    ) {
      throw new BadRequestException(
        'Informe date ou startDate/endDate, não os dois formatos juntos',
      );
    }

    let startDate: DateTime;
    let endDate: DateTime;

    /**
     * Consulta de um único dia.
     */
    if (query.date) {
      const selectedDate =
        DateTime.fromISO(
          query.date,
          {
            zone:
              tenant.timezone,
          },
        );

      if (
        !selectedDate.isValid
      ) {
        throw new BadRequestException(
          'Data inválida',
        );
      }

      startDate =
        selectedDate.startOf(
          'day',
        );

      endDate =
        selectedDate
          .plus({
            days: 1,
          })
          .startOf(
            'day',
          );
    } else {
      /**
       * Consulta por período.
       */
      if (
        !query.startDate ||
        !query.endDate
      ) {
        throw new BadRequestException(
          'Informe date ou startDate e endDate',
        );
      }

      const selectedStart =
        DateTime.fromISO(
          query.startDate,
          {
            zone:
              tenant.timezone,
          },
        );

      const selectedEnd =
        DateTime.fromISO(
          query.endDate,
          {
            zone:
              tenant.timezone,
          },
        );

      if (
        !selectedStart.isValid ||
        !selectedEnd.isValid
      ) {
        throw new BadRequestException(
          'Período inválido',
        );
      }

      if (
        selectedEnd.startOf(
          'day',
        ) <
        selectedStart.startOf(
          'day',
        )
      ) {
        throw new BadRequestException(
          'endDate não pode ser anterior a startDate',
        );
      }

      startDate =
        selectedStart.startOf(
          'day',
        );

      endDate =
        selectedEnd
          .plus({
            days: 1,
          })
          .startOf(
            'day',
          );
    }

    /**
     * OWNER / ADMIN / RECEPTIONIST
     * podem usar normalmente o employeeId
     * enviado na query.
     *
     * STAFF ignora qualquer employeeId
     * enviado pelo navegador/Postman e
     * obrigatoriamente usa o Employee
     * vinculado à própria membership.
     */
    let effectiveEmployeeId =
      query.employeeId;

    if (
      role === 'STAFF'
    ) {
      effectiveEmployeeId =
        await this.getStaffEmployeeId(
          tenantId,
          membershipId,
        );
    }

    return this.prisma.appointment.findMany({
      where: {
        tenantId,

        startsAt: {
          gte:
            startDate
              .toUTC()
              .toJSDate(),

          lt:
            endDate
              .toUTC()
              .toJSDate(),
        },

        ...(effectiveEmployeeId
          ? {
              employeeId:
                effectiveEmployeeId,
            }
          : {}),

        ...(query.status
          ? {
              status:
                query.status,
            }
          : {}),
      },

      include: {
        employee: true,
        service: true,
        client: true,
      },

      orderBy: {
        startsAt:
          'asc',
      },
    });
  }

  /**
   * Consulta individual usada pela API.
   *
   * Para STAFF, acrescentamos employeeId
   * ao WHERE. Assim, um STAFF tentando
   * acessar o agendamento de outro
   * profissional receberá 404.
   */
  async findOne(
    tenantId: string,
    id: string,
    membershipId: string,
    role: string,
  ) {
    let employeeId:
      | string
      | undefined;

    if (
      role === 'STAFF'
    ) {
      employeeId =
        await this.getStaffEmployeeId(
          tenantId,
          membershipId,
        );
    }

    const appointment =
      await this.prisma.appointment.findFirst({
        where: {
          id,
          tenantId,

          ...(employeeId
            ? {
                employeeId,
              }
            : {}),
        },

        include: {
          employee: true,
          service: true,
          client: true,
        },
      });

    if (!appointment) {
      throw new NotFoundException(
        'Agendamento não encontrado',
      );
    }

    return appointment;
  }

  async updateStatus(
    tenantId: string,
    id: string,
    data: UpdateAppointmentStatusDto,
  ) {
    const appointment =
      await this.findOneForTenant(
        tenantId,
        id,
      );

    const allowedTransitions: Record<
      string,
      string[]
    > = {
      PENDING: [
        'CONFIRMED',
      ],

      CONFIRMED: [
        'COMPLETED',
        'NO_SHOW',
      ],

      COMPLETED: [],
      NO_SHOW: [],
      CANCELED: [],
    };

    const allowed =
      allowedTransitions[
        appointment.status
      ] ?? [];

    if (
      !allowed.includes(
        data.status,
      )
    ) {
      throw new BadRequestException(
        `Não é possível alterar o status de ${appointment.status} para ${data.status}`,
      );
    }

    return this.prisma.appointment.update({
      where: {
        id,
      },

      data: {
        status:
          data.status,
      },

      include: {
        employee: true,
        service: true,
        client: true,
      },
    });
  }

  async cancel(
    tenantId: string,
    id: string,
    data: CancelAppointmentDto,
  ) {
    const appointment =
      await this.findOneForTenant(
        tenantId,
        id,
      );

    if (
      appointment.status ===
      'CANCELED'
    ) {
      return appointment;
    }

    if (
      appointment.status ===
        'COMPLETED' ||
      appointment.status ===
        'NO_SHOW'
    ) {
      throw new BadRequestException(
        'Este agendamento não pode mais ser cancelado',
      );
    }

    return this.prisma.appointment.update({
      where: {
        id,
      },

      data: {
        status:
          'CANCELED',

        canceledAt:
          new Date(),

        cancelReason:
          data.reason?.trim(),
      },

      include: {
        employee: true,
        service: true,
        client: true,
      },
    });
  }

  async reschedule(
    tenantId: string,
    id: string,
    data: RescheduleAppointmentDto,
  ) {
    const appointment =
      await this.findOneForTenant(
        tenantId,
        id,
      );

    if (
      appointment.status ===
        'CANCELED' ||
      appointment.status ===
        'COMPLETED' ||
      appointment.status ===
        'NO_SHOW'
    ) {
      throw new BadRequestException(
        `Agendamento com status ${appointment.status} não pode ser reagendado`,
      );
    }

    const tenant =
      await this.prisma.tenant.findUnique({
        where: {
          id:
            tenantId,
        },

        select: {
          timezone:
            true,
        },
      });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada',
      );
    }

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

    const availability =
      await this.availabilityService.getAvailableSlots(
        tenantId,
        appointment.employeeId,
        appointment.serviceId,
        date,
        appointment.id,
      );

    if (
      !availability.slots.includes(
        requestedTime,
      )
    ) {
      throw new BadRequestException(
        'O novo horário informado não está disponível',
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
            appointment.durationMin,
        })
        .toUTC()
        .toJSDate();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<
          Array<{
            lock_value: number;
          }>
        >`
          SELECT 1::int AS lock_value
          FROM pg_advisory_xact_lock(
            hashtext(${tenantId}),
            hashtext(${appointment.employeeId})
          )
        `;

        const conflictingAppointment =
          await tx.appointment.findFirst({
            where: {
              id: {
                not:
                  appointment.id,
              },

              tenantId,

              employeeId:
                appointment.employeeId,

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
          });

        if (
          conflictingAppointment
        ) {
          throw new ConflictException(
            'O novo horário acabou de ser ocupado',
          );
        }

        return tx.appointment.update({
          where: {
            id:
              appointment.id,
          },

          data: {
            startsAt,
            endsAt,
          },

          include: {
            employee:
              true,

            service:
              true,

            client:
              true,
          },
        });
      },
    );
  }
}