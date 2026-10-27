
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { TenantLogoService } from '../src/tenants/tenant-logo.service.js';

describe('Logo da empresa (E2E)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const secret = 'tenant-logo-e2e-test-secret';
  const tenantId = 'tenant-alpha';
  const slug = 'barbearia-alpha';

  const logoServiceMock = {
    upload: vi.fn(),
    remove: vi.fn(),
    findPublicBySlug: vi.fn(),
  };

  const logoBytes = Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]);

  function createToken(
    role: 'OWNER' | 'ADMIN' | 'RECEPTIONIST' | 'STAFF',
  ): string {
    return jwt.sign(
      {
        sub: 'user-test',
        tenantId,
        membershipId: 'membership-test',
        role,
      },
      {
        secret,
        expiresIn: '1h',
      },
    );
  }

  function uploadRequest(
    role: 'OWNER' | 'ADMIN' | 'RECEPTIONIST' | 'STAFF',
  ) {
    return request(app.getHttpServer())
      .post('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${createToken(role)}`,
      )
      .attach(
        'logo',
        logoBytes,
        {
          filename: 'logo.webp',
          contentType: 'image/webp',
        },
      );
  }

  beforeAll(async () => {
    /*
     * Protege o banco de desenvolvimento:
     * o E2E deve rodar exclusivamente
     * com agendamento_test.
     */
    const databaseUrl = process.env.DATABASE_URL;

    if (
      !databaseUrl ||
      new URL(databaseUrl).pathname !==
        '/agendamento_test'
    ) {
      throw new Error(
        'SEGURANÇA: os testes E2E exigem agendamento_test.',
      );
    }

    /*
     * Define a chave JWT apenas durante
     * esta suíte.
     */
    vi.stubEnv(
      'JWT_ACCESS_SECRET',
      secret,
    );

    jwt = new JwtService();

    const moduleRef =
      await Test.createTestingModule({
        imports: [
          AppModule,
        ],
      })
        .overrideProvider(
          TenantLogoService,
        )
        .useValue(logoServiceMock)
        .compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  }, 60000);

  beforeEach(() => {
    vi.resetAllMocks();

    logoServiceMock.upload.mockResolvedValue({
      id: 'logo-id',
      tenantId,
      slug,
      mimeType: 'image/webp',
      sizeBytes: logoBytes.length,
      updatedAt: new Date(
        '2026-10-26T12:00:00Z',
      ),
    });

    logoServiceMock.remove.mockResolvedValue({
      success: true,
      message: 'Logo removida com sucesso.',
    });

    logoServiceMock.findPublicBySlug.mockResolvedValue({
      data: new Uint8Array(logoBytes),
      mimeType: 'image/webp',
      sizeBytes: logoBytes.length,
      updatedAt: new Date(
        '2026-10-26T12:00:00Z',
      ),
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    vi.unstubAllEnvs();
  }, 30000);

  it('bloqueia upload sem JWT', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/tenants/current/logo')
      .attach(
        'logo',
        logoBytes,
        'logo.webp',
      );

    expect(response.status).toBe(401);

    expect(
      logoServiceMock.upload,
    ).not.toHaveBeenCalled();
  });

  it('bloqueia upload por STAFF', async () => {
    const response =
      await uploadRequest('STAFF');

    expect(response.status).toBe(403);

    expect(
      logoServiceMock.upload,
    ).not.toHaveBeenCalled();
  });

  it('bloqueia upload por RECEPTIONIST', async () => {
    const response =
      await uploadRequest('RECEPTIONIST');

    expect(response.status).toBe(403);

    expect(
      logoServiceMock.upload,
    ).not.toHaveBeenCalled();
  });

  it('permite upload por OWNER', async () => {
    const response =
      await uploadRequest('OWNER');

    expect(response.status).toBe(201);

    expect(response.body.tenantId).toBe(
      tenantId,
    );

    expect(
      logoServiceMock.upload,
    ).toHaveBeenCalledOnce();

    const [receivedTenantId, file] =
      logoServiceMock.upload.mock.calls[0];

    expect(receivedTenantId).toBe(
      tenantId,
    );

    expect(file.mimetype).toBe(
      'image/webp',
    );

    expect(
      Buffer.isBuffer(file.buffer),
    ).toBe(true);
  });

  it('permite upload por ADMIN', async () => {
    const response =
      await uploadRequest('ADMIN');

    expect(response.status).toBe(201);

    expect(
      logoServiceMock.upload,
    ).toHaveBeenCalledOnce();
  });

  it('rejeita JWT inválido', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/tenants/current/logo')
      .set(
        'Authorization',
        'Bearer token-invalido',
      )
      .attach(
        'logo',
        logoBytes,
        'logo.webp',
      );

    expect(response.status).toBe(401);
  });

  it('bloqueia arquivo acima de 2 MB', async () => {
    const oversizedFile = Buffer.alloc(
      2 * 1024 * 1024 + 1,
      0x41,
    );

    const response = await request(
      app.getHttpServer(),
    )
      .post('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${createToken('OWNER')}`,
      )
      .attach(
        'logo',
        oversizedFile,
        {
          filename: 'large.png',
          contentType: 'image/png',
        },
      );

    expect([400, 413]).toContain(
      response.status,
    );

    expect(
      logoServiceMock.upload,
    ).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão sem JWT', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .delete('/tenants/current/logo');

    expect(response.status).toBe(401);

    expect(
      logoServiceMock.remove,
    ).not.toHaveBeenCalled();
  });

  it('bloqueia exclusão por STAFF', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .delete('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${createToken('STAFF')}`,
      );

    expect(response.status).toBe(403);
  });

  it('permite exclusão por OWNER', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .delete('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${createToken('OWNER')}`,
      );

    expect(response.status).toBe(200);

    expect(
      logoServiceMock.remove,
    ).toHaveBeenCalledWith(
      tenantId,
    );
  });

  it('permite exclusão por ADMIN', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .delete('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${createToken('ADMIN')}`,
      );

    expect(response.status).toBe(200);
  });

  it('permite consultar a logo sem autenticação', async () => {
    const response = await request(
      app.getHttpServer(),
    ).get(
      `/public/tenants/${slug}/logo`,
    );

    expect(response.status).toBe(200);

    expect(response.headers['content-type']).toContain(
      'image/webp',
    );

    expect(
      response.headers['x-content-type-options'],
    ).toBe('nosniff');

    expect(
      logoServiceMock.findPublicBySlug,
    ).toHaveBeenCalledWith(slug);
  });

  it('retorna 404 para logo inexistente', async () => {
    logoServiceMock.findPublicBySlug.mockRejectedValue(
      new NotFoundException(
        'Logo não encontrada.',
      ),
    );

    const response = await request(
      app.getHttpServer(),
    ).get(
      '/public/tenants/sem-logo/logo',
    );

    expect(response.status).toBe(404);
  });

  it('não permite escolher outra empresa pelo corpo do upload', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${createToken('OWNER')}`,
      )
      .field(
        'tenantId',
        'outra-empresa',
      )
      .attach(
        'logo',
        logoBytes,
        {
          filename: 'logo.webp',
          contentType: 'image/webp',
        },
      );

    expect(response.status).toBe(201);

    expect(
      logoServiceMock.upload.mock.calls[0][0],
    ).toBe(tenantId);
  });
});
