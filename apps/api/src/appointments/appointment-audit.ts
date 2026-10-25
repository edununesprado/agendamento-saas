import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * O método deve receber o cliente da transação PostgreSQL em andamento.
 * Não use o PrismaService global para escrever uma auditoria de uma
 * operação que ainda não teve commit.
 */
export type AppointmentAuditTransactionClient = Pick<
  PrismaService,
  'appointmentAuditLog' | 'user'
>;

export type AppointmentAuditAction =
  | 'CREATED'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'CANCELED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'UPDATED';

export type AppointmentAuditUserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'RECEPTIONIST'
  | 'STAFF';

export type AppointmentAuditActor =
  | {
      type: 'USER';
      userId: string;
      role: AppointmentAuditUserRole;
    }
  | { type: 'PUBLIC' }
  | { type: 'SYSTEM' };

/**
 * Snapshot propositalmente restrito a dados operacionais.
 * Nunca inclua senhas, tokens, e-mails ou telefones de clientes.
 */
export type AppointmentAuditSnapshot = {
  status?:
    | 'PENDING'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'CANCELED'
    | 'NO_SHOW';
  startsAt?: string;
  endsAt?: string;
  employeeId?: string;
  serviceId?: string;
  canceledAt?: string | null;
  cancelReason?: string | null;
};

export type RecordAppointmentAuditInput = {
  tenantId: string;
  appointmentId: string;
  action: AppointmentAuditAction;
  actor: AppointmentAuditActor;
  before?: AppointmentAuditSnapshot;
  after?: AppointmentAuditSnapshot;
};

/**
 * Grava somente o evento, sem disparar e-mail ou alterar o agendamento.
 * Quem chama deve executar esta função dentro da mesma $transaction
 * que grava a mudança do Appointment / NotificationDelivery.
 */
export async function recordAppointmentAudit(
  tx: AppointmentAuditTransactionClient,
  input: RecordAppointmentAuditInput,
): Promise<void> {
  let actorUserId: string | undefined;
  let actorName: string | undefined;
  let actorRole: AppointmentAuditUserRole | undefined;

  if (input.actor.type === 'USER') {
    const user = await tx.user.findFirst({
      where: {
        id: input.actor.userId,
        memberships: {
          some: {
            tenantId: input.tenantId,
            role: input.actor.role,
          },
        },
      },
      select: { name: true },
    });

    if (!user) {
      throw new ForbiddenException(
        'Usuário responsável não pertence à empresa ou não possui a função informada',
      );
    }

    actorUserId = input.actor.userId;
    actorName = user.name;
    actorRole = input.actor.role;
  }

  await tx.appointmentAuditLog.create({
    data: {
      tenantId: input.tenantId,
      appointmentId: input.appointmentId,
      action: input.action,
      actorType: input.actor.type,
      actorUserId,
      actorName,
      actorRole,
      ...(input.before ? { before: input.before } : {}),
      ...(input.after ? { after: input.after } : {}),
    },
    select: { id: true },
  });
}
