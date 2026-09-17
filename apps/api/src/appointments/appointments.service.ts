import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import { AvailabilityService } from '../availability/availability.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

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
      localDateTime.toFormat('HH:mm');

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
        // Impede duas requisições simultâneas de
        // criarem horários sobrepostos para o mesmo profissional.
        await tx.$queryRaw<Array<{ lock_value: number }>>`
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

        if (conflictingAppointment) {
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

            // Agendamento criado pelo painel interno
            // já começa confirmado.
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

    const selectedDate =
      DateTime.fromISO(
        query.date,
        {
          zone: tenant.timezone,
        },
      );

    if (!selectedDate.isValid) {
      throw new BadRequestException(
        'Data inválida',
      );
    }

    const startsAt =
      selectedDate
        .startOf('day')
        .toUTC()
        .toJSDate();

    const endsAt =
      selectedDate
        .endOf('day')
        .toUTC()
        .toJSDate();

    return this.prisma.appointment.findMany({
      where: {
        tenantId,

        startsAt: {
          gte: startsAt,
          lte: endsAt,
        },

        ...(query.employeeId
          ? {
              employeeId:
                query.employeeId,
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
        startsAt: 'asc',
      },
    });
  }

  async findOne(
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

  async updateStatus(
    tenantId: string,
    id: string,
    data: UpdateAppointmentStatusDto,
  ) {
    const appointment =
      await this.findOne(
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
        status: data.status,
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
      await this.findOne(
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
        status: 'CANCELED',
        canceledAt: new Date(),
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
}