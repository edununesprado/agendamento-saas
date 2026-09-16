import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async register(data: RegisterDto) {
    const email = data.email.trim().toLowerCase();

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException(
        'Já existe um usuário cadastrado com este e-mail',
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const baseSlug = this.generateSlug(data.companyName);
    const slug = await this.generateUniqueSlug(baseSlug);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name.trim(),
          email,
          passwordHash,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: data.companyName.trim(),
          slug,
        },
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'OWNER',
        },
      });

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },

        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },

        membership: {
          id: membership.id,
          role: membership.role,
        },
      };
    });
  }

  private generateSlug(value: string) {
    const slug = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'empresa';
  }

  private async generateUniqueSlug(baseSlug: string) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: {
        slug: baseSlug,
      },
    });

    if (!existingTenant) {
      return baseSlug;
    }

    return `${baseSlug}-${randomUUID().slice(0, 8)}`;
  }
}