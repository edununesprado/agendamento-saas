
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Logo no PostgreSQL (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId: string;
  let tenantSlug: string;
  let ownerToken: string;

  const unique = `${Date.now()}`;
  const email = `logo.storage.${unique}@example.test`;
  const password = 'Teste@12345';

  let pngBuffer: Buffer;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;

    if (
      !url ||
      new URL(url).hostname !== 'localhost' ||
      new URL(url).pathname !== '/agendamento_test'
    ) {
      throw new Error(
        'Este teste exige PostgreSQL local e banco agendamento_test.',
      );
    }

    const moduleRef =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);

    pngBuffer = await sharp({
      create: {
        width: 48,
        height: 48,
        channels: 4,
        background: {
          r: 40,
          g: 110,
          b: 200,
          alpha: 1,
        },
      },
    })
      .png()
      .toBuffer();

    const register = await request(
      app.getHttpServer(),
    )
      .post('/auth/register')
      .send({
        name: 'Proprietário Logo E2E',
        email,
        password,
        companyName: `Empresa Logo ${unique}`,
      });

    expect(register.status).toBe(201);

    const login = await request(
      app.getHttpServer(),
    )
      .post('/auth/login')
      .send({
        email,
        password,
      });

    expect([200, 201]).toContain(login.status);

    ownerToken = login.body.accessToken;

    const current = await request(
      app.getHttpServer(),
    )
      .get('/tenants/current')
      .set(
        'Authorization',
        `Bearer ${ownerToken}`,
      );

    expect(current.status).toBe(200);

    tenantId = current.body.id;
    tenantSlug = current.body.slug;
  }, 60000);

  afterAll(async () => {
    if (prisma && tenantId) {
      await prisma.tenant.delete({
        where: {
          id: tenantId,
        },
      });
    }

    if (prisma) {
      await prisma.user.deleteMany({
        where: {
          email,
        },
      });
    }

    if (app) {
      await app.close();
    }
  }, 30000);

  it('inicia sem imagem armazenada', async () => {
    const current = await request(
      app.getHttpServer(),
    )
      .get('/tenants/current')
      .set(
        'Authorization',
        `Bearer ${ownerToken}`,
      );

    expect(current.status).toBe(200);
    expect(current.body.hasStoredLogo).toBe(false);
  });

  it('grava uma imagem WebP no PostgreSQL', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${ownerToken}`,
      )
      .attach('logo', pngBuffer, {
        filename: 'empresa.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    expect(response.body.mimeType).toBe('image/webp');

    const saved = await prisma.tenantLogo.findUnique({
      where: {
        tenantId,
      },
    });

    expect(saved).not.toBeNull();
    expect(saved?.mimeType).toBe('image/webp');
    expect(saved?.sizeBytes).toBeGreaterThan(0);
    expect(saved?.tenantId).toBe(tenantId);

    const bytes = Buffer.from(saved!.data);

    expect(
      bytes.toString('ascii', 8, 12),
    ).toBe('WEBP');
  });

  it('informa que a empresa possui logo', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .get('/tenants/current')
      .set(
        'Authorization',
        `Bearer ${ownerToken}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.hasStoredLogo).toBe(true);
    expect(response.body).not.toHaveProperty('logoImage');
  });

  it('informa a existência da logo publicamente', async () => {
    const response = await request(
      app.getHttpServer(),
    ).get(`/public/tenants/${tenantSlug}`);

    expect(response.status).toBe(200);
    expect(response.body.hasStoredLogo).toBe(true);
    expect(response.body).not.toHaveProperty('logoImage');
  });

  it('entrega a imagem pública como WebP', async () => {
    const response = await request(
      app.getHttpServer(),
    ).get(
      `/public/tenants/${tenantSlug}/logo`,
    );

    expect(response.status).toBe(200);

    expect(
      response.headers['content-type'],
    ).toContain('image/webp');

    expect(
      response.headers['x-content-type-options'],
    ).toBe('nosniff');
  });

  it('remove a imagem e o registro do banco', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .delete('/tenants/current/logo')
      .set(
        'Authorization',
        `Bearer ${ownerToken}`,
      );

    expect(response.status).toBe(200);

    const saved = await prisma.tenantLogo.findUnique({
      where: {
        tenantId,
      },
    });

    expect(saved).toBeNull();

    const publicResponse = await request(
      app.getHttpServer(),
    ).get(
      `/public/tenants/${tenantSlug}/logo`,
    );

    expect(publicResponse.status).toBe(404);
  });
});
