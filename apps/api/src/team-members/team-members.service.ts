import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';

import { CreateTeamMemberDto } from './dto/create-team-member.dto.js';
import { LinkTeamMemberEmployeeDto } from './dto/link-team-member-employee.dto.js';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto.js';

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Lista os usuários da empresa.
   */
  async findAll(
    tenantId: string,
  ) {
    return this.prisma.membership.findMany({
      where: {
        tenantId,
      },

      select: {
        id: true,
        role: true,
        createdAt: true,
        updatedAt: true,

        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },

        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
          },
        },
      },

      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Cria um novo usuário dentro
   * da empresa atual.
   */
  async create(
    tenantId: string,
    data: CreateTeamMemberDto,
  ) {
    const email =
      data.email
        .trim()
        .toLowerCase();

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email,
        },

        select: {
          id: true,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'Já existe um usuário cadastrado com este e-mail',
      );
    }

    const passwordHash =
      await bcrypt.hash(
        data.password,
        12,
      );

    return this.prisma.$transaction(
      async (tx) => {
        const user =
          await tx.user.create({
            data: {
              name:
                data.name.trim(),

              email,

              passwordHash,
            },
          });

        return tx.membership.create({
          data: {
            tenantId,
            userId:
              user.id,
            role:
              data.role,
          },

          select: {
            id: true,
            role: true,
            createdAt: true,

            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                active: true,
              },
            },
          },
        });
      },
    );
  }

  /**
   * Altera a função de um usuário.
   */
  async updateRole(
    tenantId: string,
    membershipId: string,
    data: UpdateTeamMemberRoleDto,
  ) {
    const membership =
      await this.prisma.membership.findFirst({
        where: {
          id:
            membershipId,
          tenantId,
        },

        include: {
          employee: true,
        },
      });

    if (!membership) {
      throw new NotFoundException(
        'Usuário da empresa não encontrado',
      );
    }

    if (
      membership.role ===
      'OWNER'
    ) {
      throw new BadRequestException(
        'A função do proprietário não pode ser alterada por esta operação',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Se o usuário deixar de ser STAFF,
         * removemos automaticamente qualquer
         * vínculo com Employee.
         */
        if (
          data.role !== 'STAFF' &&
          membership.employee
        ) {
          await tx.employee.update({
            where: {
              id:
                membership.employee.id,
            },

            data: {
              membershipId:
                null,
            },
          });
        }

        return tx.membership.update({
          where: {
            id:
              membership.id,
          },

          data: {
            role:
              data.role,
          },

          select: {
            id: true,
            role: true,
            updatedAt: true,

            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                active: true,
              },
            },
          },
        });
      },
    );
  }

  /**
   * Vincula ou desvincula um
   * usuário STAFF de um Employee.
   */
  async linkEmployee(
    tenantId: string,
    membershipId: string,
    data: LinkTeamMemberEmployeeDto,
  ) {
    const membership =
      await this.prisma.membership.findFirst({
        where: {
          id:
            membershipId,
          tenantId,
        },

        include: {
          employee: true,

          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

    if (!membership) {
      throw new NotFoundException(
        'Usuário da empresa não encontrado',
      );
    }

    if (
      membership.role !==
      'STAFF'
    ) {
      throw new BadRequestException(
        'Somente usuários com função STAFF podem ser vinculados a um funcionário',
      );
    }

    /*
     * employeeId = null
     *
     * Remove o vínculo atual.
     */
    if (
      data.employeeId ===
      null
    ) {
      if (
        membership.employee
      ) {
        await this.prisma.employee.update({
          where: {
            id:
              membership.employee.id,
          },

          data: {
            membershipId:
              null,
          },
        });
      }

      return this.prisma.membership.findUnique({
        where: {
          id:
            membership.id,
        },

        select: {
          id: true,
          role: true,

          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

          employee: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              active: true,
            },
          },
        },
      });
    }

    /*
     * Confirma que o funcionário
     * pertence à mesma empresa.
     */
    const employee =
      await this.prisma.employee.findFirst({
        where: {
          id:
            data.employeeId,
          tenantId,
        },

        select: {
          id: true,
          name: true,
          membershipId: true,
        },
      });

    if (!employee) {
      throw new NotFoundException(
        'Funcionário não encontrado',
      );
    }

    /*
     * Impede que o mesmo Employee
     * seja usado por dois usuários.
     */
    if (
      employee.membershipId &&
      employee.membershipId !==
        membership.id
    ) {
      throw new ConflictException(
        'Este funcionário já está vinculado a outro usuário',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Se o usuário já estiver ligado
         * a outro funcionário, removemos
         * o vínculo anterior.
         */
        if (
          membership.employee &&
          membership.employee.id !==
            employee.id
        ) {
          await tx.employee.update({
            where: {
              id:
                membership.employee.id,
            },

            data: {
              membershipId:
                null,
            },
          });
        }

        /*
         * Vincula o novo funcionário.
         */
        await tx.employee.update({
          where: {
            id:
              employee.id,
          },

          data: {
            membershipId:
              membership.id,
          },
        });

        return tx.membership.findUnique({
          where: {
            id:
              membership.id,
          },

          select: {
            id: true,
            role: true,

            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                active: true,
              },
            },
          },
        });
      },
    );
  }
}