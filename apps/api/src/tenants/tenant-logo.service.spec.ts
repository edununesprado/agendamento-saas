
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import sharp from 'sharp';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';

import {
  TenantLogoService,
  type TenantLogoUpload,
} from './tenant-logo.service.js';

describe('TenantLogoService', () => {
  let service: TenantLogoService;

  const tenantId = 'tenant-alpha';
  const slug = 'barbearia-alpha';

  const savedLogo = {
    id: 'logo-alpha',
    mimeType: 'image/webp',
    sizeBytes: 200,
    updatedAt: new Date('2026-10-26T12:00:00Z'),
  };

  const txMock = {
    tenantLogo: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    tenant: {
      update: vi.fn(),
    },
  };

  const prismaMock = {
    tenant: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  async function validPng(): Promise<TenantLogoUpload> {
    const buffer = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: {
          r: 30,
          g: 120,
          b: 210,
          alpha: 1,
        },
      },
    })
      .png()
      .toBuffer();

    return {
      buffer,
      mimetype: 'image/png',
      size: buffer.byteLength,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();

    prismaMock.tenant.findUnique.mockResolvedValue({
      id: tenantId,
      slug,
    });

    txMock.tenantLogo.upsert.mockResolvedValue(
      savedLogo,
    );

    txMock.tenantLogo.deleteMany.mockResolvedValue({
      count: 1,
    });

    txMock.tenant.update.mockResolvedValue({
      id: tenantId,
      logoUrl: null,
    });

    prismaMock.$transaction.mockImplementation(
      async (
        callback: (
          tx: typeof txMock,
        ) => Promise<unknown>,
      ) => callback(txMock),
    );

    service = new TenantLogoService(
      prismaMock as unknown as PrismaService,
    );
  });

  it('deve inicializar o serviço', () => {
    expect(service).toBeDefined();
  });

  it('deve rejeitar ausência de arquivo', async () => {
    await expect(
      service.upload(tenantId, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      prismaMock.$transaction,
    ).not.toHaveBeenCalled();
  });

  it('deve rejeitar arquivo vazio', async () => {
    await expect(
      service.upload(tenantId, {
        buffer: Buffer.alloc(0),
        mimetype: 'image/png',
        size: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar arquivo maior que 2 MB', async () => {
    const buffer = Buffer.alloc(
      2 * 1024 * 1024 + 1,
    );

    await expect(
      service.upload(tenantId, {
        buffer,
        mimetype: 'image/png',
        size: buffer.byteLength,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar MIME não permitido', async () => {
    await expect(
      service.upload(tenantId, {
        buffer: Buffer.from(
          '<svg></svg>',
        ),
        mimetype: 'image/svg+xml',
        size: 11,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar MIME diferente do conteúdo', async () => {
    const file = await validPng();

    await expect(
      service.upload(tenantId, {
        ...file,
        mimetype: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve rejeitar arquivo com assinatura falsa', async () => {
    const buffer = Buffer.concat([
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
      ]),
      Buffer.alloc(20),
    ]);

    await expect(
      service.upload(tenantId, {
        buffer,
        mimetype: 'image/png',
        size: buffer.byteLength,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve converter PNG válido para WebP', async () => {
    const file = await validPng();

    await service.upload(tenantId, file);

    expect(
      txMock.tenantLogo.upsert,
    ).toHaveBeenCalledOnce();

    const params =
      txMock.tenantLogo.upsert.mock.calls[0][0];

    expect(params.where).toEqual({
      tenantId,
    });

    expect(params.create.mimeType).toBe(
      'image/webp',
    );

    expect(params.create.data).toBeInstanceOf(
      Uint8Array,
    );

    expect(params.create.sizeBytes).toBeGreaterThan(
      0,
    );

    expect(
      Buffer.from(params.create.data).toString(
        'ascii',
        8,
        12,
      ),
    ).toBe('WEBP');
  });

  it('deve atualizar somente a empresa autenticada', async () => {
    await service.upload(
      tenantId,
      await validPng(),
    );

    expect(
      txMock.tenant.update,
    ).toHaveBeenCalledWith({
      where: {
        id: tenantId,
      },
      data: {
        logoUrl: null,
      },
    });
  });

  it('não deve salvar para empresa inexistente', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(
      null,
    );

    await expect(
      service.upload(
        tenantId,
        await validPng(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      prismaMock.$transaction,
    ).not.toHaveBeenCalled();
  });

  it('deve retornar a imagem pública por slug', async () => {
    const data = new Uint8Array(
      new ArrayBuffer(4),
    );

    prismaMock.tenant.findUnique.mockResolvedValue({
      logoImage: {
        data,
        mimeType: 'image/webp',
        sizeBytes: 4,
        updatedAt: savedLogo.updatedAt,
      },
    });

    const result =
      await service.findPublicBySlug(slug);

    expect(result.mimeType).toBe('image/webp');
    expect(result.data).toBe(data);

    expect(
      prismaMock.tenant.findUnique,
    ).toHaveBeenCalledWith({
      where: {
        slug,
      },
      select: {
        logoImage: {
          select: {
            data: true,
            mimeType: true,
            sizeBytes: true,
            updatedAt: true,
          },
        },
      },
    });
  });

  it('deve retornar 404 quando a logo não existir', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      logoImage: null,
    });

    await expect(
      service.findPublicBySlug(slug),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deve remover somente a logo da empresa informada', async () => {
    const result = await service.remove(
      tenantId,
    );

    expect(result.success).toBe(true);

    expect(
      txMock.tenantLogo.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        tenantId,
      },
    });

    expect(
      txMock.tenant.update,
    ).toHaveBeenCalledWith({
      where: {
        id: tenantId,
      },
      data: {
        logoUrl: null,
      },
    });
  });
});
