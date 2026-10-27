
import {
  StreamableFile,
} from '@nestjs/common';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  JwtPayload,
} from '../auth/types/jwt-payload.js';

import type {
  TenantLogoService,
  TenantLogoUpload,
} from './tenant-logo.service.js';

import {
  PublicTenantLogoController,
  TenantLogoController,
} from './tenants.controller.js';

describe('Controladores da logo', () => {
  const user: JwtPayload = {
    sub: 'user-test',
    tenantId: 'tenant-alpha',
    membershipId: 'membership-test',
    role: 'OWNER',
  };

  const serviceMock = {
    upload: vi.fn(),
    remove: vi.fn(),
    findPublicBySlug: vi.fn(),
  };

  let protectedController:
    TenantLogoController;

  let publicController:
    PublicTenantLogoController;

  beforeEach(() => {
    vi.resetAllMocks();

    protectedController =
      new TenantLogoController(
        serviceMock as unknown as TenantLogoService,
      );

    publicController =
      new PublicTenantLogoController(
        serviceMock as unknown as TenantLogoService,
      );
  });

  it('envia o tenantId autenticado para o serviço de upload', async () => {
    const buffer = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46,
    ]);

    const file: TenantLogoUpload = {
      buffer,
      mimetype: 'image/webp',
      size: buffer.length,
    };

    serviceMock.upload.mockResolvedValue({
      id: 'logo-id',
    });

    await protectedController.uploadLogo(
      user,
      file,
    );

    expect(
      serviceMock.upload,
    ).toHaveBeenCalledWith(
      'tenant-alpha',
      file,
    );
  });

  it('envia o tenantId autenticado para a exclusão', async () => {
    serviceMock.remove.mockResolvedValue({
      success: true,
    });

    await protectedController.removeLogo(
      user,
    );

    expect(
      serviceMock.remove,
    ).toHaveBeenCalledWith(
      'tenant-alpha',
    );
  });

  it('consulta a imagem pública pelo slug', async () => {
    const buffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x04, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ]);

    const arrayBuffer =
      new ArrayBuffer(buffer.length);

    const data =
      new Uint8Array(arrayBuffer);

    data.set(buffer);

    serviceMock.findPublicBySlug.mockResolvedValue({
      data,
      mimeType: 'image/webp',
      sizeBytes: buffer.length,
      updatedAt: new Date(),
    });

    const response =
      await publicController.getLogo(
        'barbearia-alpha',
      );

    expect(response).toBeInstanceOf(
      StreamableFile,
    );

    expect(
      response.getHeaders().type,
    ).toBe('image/webp');

    expect(
      serviceMock.findPublicBySlug,
    ).toHaveBeenCalledWith(
      'barbearia-alpha',
    );
  });
});
