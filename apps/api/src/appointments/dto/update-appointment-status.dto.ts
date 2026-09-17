import { IsIn } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @IsIn([
    'CONFIRMED',
    'COMPLETED',
    'NO_SHOW',
  ])
  status!:
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'NO_SHOW';
}