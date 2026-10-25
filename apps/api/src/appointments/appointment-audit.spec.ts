
import {
  ForbiddenException,
} from '@nestjs/common';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  recordAppointmentAudit,
  type AppointmentAuditTransactionClient,
} from './appointment-audit.js';

describe('AppointmentAudit', () => {
  const findUser = vi.fn();
  const createAudit = vi.fn();

  const tx = {
    user: {
      findFirst: findUser,
    },
    appointmentAuditLog: {
      create: createAudit,
    },
  } as unknown as AppointmentAuditTransactionClient;

  beforeEach(() => {
    vi.resetAllMocks();

    createAudit.mockResolvedValue({
      id: 'audit-1',
    });
  });

  it('registra um agendamento criado pelo site público', async () => {
    await recordAppointmentAudit(tx, {
      tenantId: 'tenant-1',
      appointmentId: 'appointment-1',
      action: 'CREATED',
      actor: {
        type: 'PUBLIC',
      },
      after: {
        status: 'PENDING',
        startsAt:
          '2026-10-26T11:00:00.000Z',
      },
    });

    expect(findUser).not.toHaveBeenCalled();

    expect(createAudit).toHaveBeenCalledTimes(1);

    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        appointmentId: 'appointment-1',
        action: 'CREATED',
        actorType: 'PUBLIC',
        after: {
          status: 'PENDING',
          startsAt:
            '2026-10-26T11:00:00.000Z',
        },
      }),
      select: {
        id: true,
      },
    });
  });

  it('registra o usuário responsável pela confirmação', async () => {
    findUser.mockResolvedValue({
      name: 'Administrador Teste',
    });

    await recordAppointmentAudit(tx, {
      tenantId: 'tenant-1',
      appointmentId: 'appointment-1',
      action: 'CONFIRMED',
      actor: {
        type: 'USER',
        userId: 'user-1',
        role: 'OWNER',
      },
      before: {
        status: 'PENDING',
      },
      after: {
        status: 'CONFIRMED',
      },
    });

    expect(findUser).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        memberships: {
          some: {
            tenantId: 'tenant-1',
            role: 'OWNER',
          },
        },
      },
      select: {
        name: true,
      },
    });

    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        appointmentId: 'appointment-1',
        action: 'CONFIRMED',
        actorType: 'USER',
        actorUserId: 'user-1',
        actorName: 'Administrador Teste',
        actorRole: 'OWNER',
        before: {
          status: 'PENDING',
        },
        after: {
          status: 'CONFIRMED',
        },
      }),
      select: {
        id: true,
      },
    });
  });

  it('impede auditoria com usuário de outra empresa', async () => {
    findUser.mockResolvedValue(null);

    await expect(
      recordAppointmentAudit(tx, {
        tenantId: 'tenant-1',
        appointmentId: 'appointment-1',
        action: 'CANCELED',
        actor: {
          type: 'USER',
          userId: 'user-2',
          role: 'ADMIN',
        },
      }),
    ).rejects.toThrow(
      ForbiddenException,
    );

    expect(createAudit).not.toHaveBeenCalled();
  });

  it('registra operações automáticas do sistema', async () => {
    await recordAppointmentAudit(tx, {
      tenantId: 'tenant-1',
      appointmentId: 'appointment-1',
      action: 'UPDATED',
      actor: {
        type: 'SYSTEM',
      },
      after: {
        status: 'CONFIRMED',
      },
    });

    expect(findUser).not.toHaveBeenCalled();

    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'SYSTEM',
        action: 'UPDATED',
      }),
      select: {
        id: true,
      },
    });
  });

  it('propaga falhas na gravação da auditoria', async () => {
    createAudit.mockRejectedValue(
      new Error('Falha no banco'),
    );

    await expect(
      recordAppointmentAudit(tx, {
        tenantId: 'tenant-1',
        appointmentId: 'appointment-1',
        action: 'CREATED',
        actor: {
          type: 'PUBLIC',
        },
      }),
    ).rejects.toThrow('Falha no banco');
  });
});
