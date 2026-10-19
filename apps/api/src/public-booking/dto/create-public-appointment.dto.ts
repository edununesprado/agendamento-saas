import { Type } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PublicClientDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^[0-9()+\-\s]{8,20}$/,
    {
      message:
        'phone deve conter um telefone válido',
    },
  )
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}

export class CreatePublicAppointmentDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsISO8601()
  @Matches(
    /(?:Z|[+-]\d{2}:\d{2})$/,
    {
      message:
        'startsAt deve informar o fuso horário, por exemplo Z ou -03:00',
    },
  )
  startsAt!: string;

  @ValidateNested()
  @Type(
    () => PublicClientDto,
  )
  client!: PublicClientDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}