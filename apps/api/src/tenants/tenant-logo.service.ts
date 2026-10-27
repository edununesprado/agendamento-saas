
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';

import { PrismaService } from '../prisma/prisma.service.js';

export type TenantLogoUpload = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

export type PublicTenantLogo = {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
  sizeBytes: number;
  updatedAt: Date;
};

type ValidatedTenantLogo = {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class TenantLogoService {
  private readonly maxFileSize = 2 * 1024 * 1024;
  private readonly maxInputPixels = 16_000_000;
  private readonly maxDimension = 512;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * Detecta PNG, JPEG ou WebP pela
   * assinatura binária inicial.
   *
   * A decodificação completa ocorrerá
   * posteriormente com o Sharp.
   */
  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 12) {
      return null;
    }

    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    if (
      buffer.subarray(0, 8).equals(pngSignature)
    ) {
      return 'image/png';
    }

    if (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  /*
   * Validação e normalização.
   *
   * 1. Limite de entrada: 2 MB.
   * 2. MIME permitido e assinatura real.
   * 3. Decodificação com Sharp.
   * 4. Limite de pixels.
   * 5. Rejeição de imagens animadas.
   * 6. Ajuste para até 512 x 512.
   * 7. Conversão para WebP.
   * 8. Remoção de metadados na conversão.
   * 9. Limite de saída: 2 MB.
   */
  private async validateFile(
    file: TenantLogoUpload | undefined,
  ): Promise<ValidatedTenantLogo> {
    if (
      !file ||
      !Buffer.isBuffer(file.buffer)
    ) {
      throw new BadRequestException(
        'Selecione uma imagem válida.',
      );
    }

    const inputSize = file.buffer.byteLength;

    if (inputSize === 0) {
      throw new BadRequestException(
        'O arquivo de imagem está vazio.',
      );
    }

    if (inputSize > this.maxFileSize) {
      throw new BadRequestException(
        'A imagem deve possuir no máximo 2 MB.',
      );
    }

    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
    ];

    if (
      !allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new BadRequestException(
        'Formato não permitido. Utilize PNG, JPEG ou WebP.',
      );
    }

    const detectedMimeType =
      this.detectMimeType(file.buffer);

    if (
      !detectedMimeType ||
      detectedMimeType !== file.mimetype
    ) {
      throw new BadRequestException(
        'O tipo do arquivo não corresponde ao conteúdo enviado.',
      );
    }

    let processed: Buffer;

    try {
      const options = {
        limitInputPixels: this.maxInputPixels,
        failOn: 'error' as const,
        animated: false,
      };

      const metadata = await sharp(
        file.buffer,
        options,
      ).metadata();

      const detectedFormat: Record<string, string> = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };

      if (
        !metadata.format ||
        detectedFormat[metadata.format] !==
          detectedMimeType
      ) {
        throw new Error('Formato de imagem inválido.');
      }

      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height >
          this.maxInputPixels
      ) {
        throw new Error('Dimensões inválidas.');
      }

      if ((metadata.pages ?? 1) > 1) {
        throw new Error('Imagem animada não permitida.');
      }

      processed = await sharp(
        file.buffer,
        options,
      )
        .rotate()
        .resize({
          width: this.maxDimension,
          height: this.maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 85,
          effort: 4,
        })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Imagem inválida, corrompida ou não suportada.',
      );
    }

    if (
      processed.byteLength === 0 ||
      processed.byteLength > this.maxFileSize
    ) {
      throw new BadRequestException(
        'Não foi possível gerar uma imagem dentro do limite de 2 MB.',
      );
    }

    /*
     * Prisma 7 exige Uint8Array<ArrayBuffer>.
     * Copiamos os bytes para um ArrayBuffer
     * específico, evitando problemas
     * com ArrayBufferLike.
     */
    const arrayBuffer = new ArrayBuffer(
      processed.byteLength,
    );

    const data = new Uint8Array(arrayBuffer);
    data.set(processed);

    return {
      data,
      mimeType: 'image/webp',
      sizeBytes: processed.byteLength,
    };
  }

  private async findTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: {
        id: tenantId,
      },
      select: {
        id: true,
        slug: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'Empresa não encontrada.',
      );
    }

    return tenant;
  }

  /*
   * Salva ou substitui a logo.
   *
   * O tenantId deverá ser obtido
   * pelo controller a partir do JWT.
   *
   * A transação mantém a logo e
   * a referência antiga consistentes.
   */
  async upload(
    tenantId: string,
    file: TenantLogoUpload | undefined,
  ) {
    const validated = await this.validateFile(file);

    const tenant = await this.findTenant(tenantId);

    return this.prisma.$transaction(
      async (tx) => {
        const logo = await tx.tenantLogo.upsert({
          where: {
            tenantId,
          },
          create: {
            tenantId,
            data: validated.data,
            mimeType: validated.mimeType,
            sizeBytes: validated.sizeBytes,
          },
          update: {
            data: validated.data,
            mimeType: validated.mimeType,
            sizeBytes: validated.sizeBytes,
          },
          select: {
            id: true,
            mimeType: true,
            sizeBytes: true,
            updatedAt: true,
          },
        });

        await tx.tenant.update({
          where: {
            id: tenantId,
          },
          data: {
            logoUrl: null,
          },
        });

        return {
          ...logo,
          tenantId,
          slug: tenant.slug,
        };
      },
    );
  }

  /*
   * Consulta pública por slug.
   *
   * Retorna a imagem binária apenas
   * para a rota de exibição.
   */
  async findPublicBySlug(
    slug: string,
  ): Promise<PublicTenantLogo> {
    const tenant = await this.prisma.tenant.findUnique({
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

    if (!tenant || !tenant.logoImage) {
      throw new NotFoundException(
        'Logo não encontrada.',
      );
    }

    return {
      data: tenant.logoImage.data,
      mimeType: tenant.logoImage.mimeType,
      sizeBytes: tenant.logoImage.sizeBytes,
      updatedAt: tenant.logoImage.updatedAt,
    };
  }

  /*
   * Remove a imagem e limpa
   * a referência antiga.
   */
  async remove(tenantId: string) {
    await this.findTenant(tenantId);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.tenantLogo.deleteMany({
          where: {
            tenantId,
          },
        });

        await tx.tenant.update({
          where: {
            id: tenantId,
          },
          data: {
            logoUrl: null,
          },
        });
      },
    );

    return {
      success: true,
      message: 'Logo removida com sucesso.',
    };
  }
}
