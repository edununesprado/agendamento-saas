import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  async login(data: LoginDto) {
    const email = data.email.trim().toLowerCase();

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const passwordMatches = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: user.id,
      },
      include: {
        tenant: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!membership) {
      throw new UnauthorizedException(
        'Usuário não possui acesso a nenhuma empresa',
      );
    }

    const secret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
    );

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET não está configurado');
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        tenantId: membership.tenantId,
        membershipId: membership.id,
        role: membership.role,
      },
      {
        secret,
        expiresIn: '15m',
      },
    );

    return {
      accessToken,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },

      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
      },

      membership: {
        id: membership.id,
        role: membership.role,
      },
    };
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