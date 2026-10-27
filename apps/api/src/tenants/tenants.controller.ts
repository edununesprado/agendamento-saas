
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  ThrottlerGuard,
} from '@nestjs/throttler';

import {
  CurrentUser,
} from '../auth/decorators/current-user.decorator.js';

import {
  Roles,
} from '../auth/decorators/roles.decorator.js';

import {
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard.js';

import {
  RolesGuard,
} from '../auth/guards/roles.guard.js';

import type {
  JwtPayload,
} from '../auth/types/jwt-payload.js';

import {
  UpdateTenantDto,
} from './dto/update-tenant.dto.js';

import {
  TenantLogoService,
  type TenantLogoUpload,
} from './tenant-logo.service.js';

import {
  TenantsService,
} from './tenants.service.js';

/*
 * CONTROLADOR EXISTENTE
 *
 * Mantém os endpoints atuais:
 *
 * GET   /tenants/current
 * PATCH /tenants/current
 *
 * As permissões existentes
 * permanecem inalteradas.
 */
@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('current')
  findCurrent(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tenantsService.findCurrent(
      user.tenantId,
    );
  }

  @Patch('current')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  updateCurrent(
    @CurrentUser() user: JwtPayload,
    @Body() data: UpdateTenantDto,
  ) {
    return this.tenantsService.updateCurrent(
      user.tenantId,
      data,
    );
  }
}

/*
 * ETAPA 6.3 — CONTROLE DA LOGO
 *
 * Endpoints autenticados:
 *
 * POST   /tenants/current/logo
 * DELETE /tenants/current/logo
 *
 * Somente OWNER e ADMIN
 * podem alterar a imagem.
 *
 * O tenantId vem do JWT.
 *
 * Não permitimos que o usuário
 * informe livremente a empresa
 * que receberá a imagem.
 */
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class TenantLogoController {
  constructor(
    private readonly tenantLogoService:
      TenantLogoService,
  ) {}

  /*
   * UPLOAD DA LOGO
   *
   * Enviar:
   *
   * Content-Type: multipart/form-data
   *
   * Campo do arquivo: logo
   *
   * Tamanho máximo: 2 MB
   *
   * A verificação do conteúdo
   * é feita pelo TenantLogoService.
   */
  @Post('current/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  uploadLogo(
    @CurrentUser()
    user: JwtPayload,

    @UploadedFile()
    file: TenantLogoUpload | undefined,
  ) {
    return this.tenantLogoService.upload(
      user.tenantId,
      file,
    );
  }

  /*
   * REMOVE A LOGO DA EMPRESA
   *
   * Remove a imagem armazenada
   * no PostgreSQL e limpa a URL
   * anteriormente cadastrada.
   */
  @Delete('current/logo')
  removeLogo(
    @CurrentUser()
    user: JwtPayload,
  ) {
    return this.tenantLogoService.remove(
      user.tenantId,
    );
  }
}

/*
 * ETAPA 6.3 — IMAGEM PÚBLICA
 *
 * GET /public/tenants/:slug/logo
 *
 * Não exige JWT, pois a logo
 * poderá aparecer na página
 * pública de agendamento.
 *
 * A resposta contém apenas
 * os bytes da imagem.
 *
 * Não retorna informações
 * administrativas da empresa.
 */
@Controller('public/tenants')
@UseGuards(ThrottlerGuard)
export class PublicTenantLogoController {
  constructor(
    private readonly tenantLogoService:
      TenantLogoService,
  ) {}

  @Get(':slug/logo')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header(
    'Cache-Control',
    'public, max-age=0, must-revalidate',
  )
  async getLogo(
    @Param('slug')
    slug: string,
  ): Promise<StreamableFile> {
    const logo =
      await this.tenantLogoService.findPublicBySlug(
        slug,
      );

    return new StreamableFile(
      Buffer.from(logo.data),
      {
        type: logo.mimeType,
        length: logo.sizeBytes,
        disposition: 'inline',
      },
    );
  }
}
