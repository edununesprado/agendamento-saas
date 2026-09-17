import {
  IsDateString,
  Matches,
} from 'class-validator';

export class RescheduleAppointmentDto {
  @IsDateString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    {
      message:
        'startsAt deve incluir timezone, exemplo: 2026-09-21T10:00:00-03:00',
    },
  )
  startsAt!: string;
}