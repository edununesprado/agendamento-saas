import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  employeeId!: string;

  @IsString()
  serviceId!: string;

  @IsString()
  clientId!: string;

  @IsDateString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    {
      message:
        'startsAt deve incluir timezone, exemplo: 2026-09-21T08:00:00-03:00',
    },
  )
  startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}