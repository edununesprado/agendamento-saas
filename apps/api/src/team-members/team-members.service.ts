import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTeamMemberDto } from './dto/create-team-member.dto.js';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto.js';

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

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
      },

      orderBy: {
        createdAt: 'asc',
      },
    });
  }

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
            userId: user.id,
            role: data.role,
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
          },
        });
      },
    );
  }

  async updateRole(
    tenantId: string,
    membershipId: string,
    data: UpdateTeamMemberRoleDto,
  ) {
    const membership =
      await this.prisma.membership.findFirst({
        where: {
          id: membershipId,
          tenantId,
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

    return this.prisma.membership.update({
      where: {
        id: membership.id,
      },

      data: {
        role: data.role,
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
      },
    });
  }
}