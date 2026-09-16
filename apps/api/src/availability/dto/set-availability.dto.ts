import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';

export enum DayOfWeekDto {
  SUNDAY = 'SUNDAY',
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
}

export class AvailabilityIntervalDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'start deve estar no formato HH:mm',
  })
  start!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'end deve estar no formato HH:mm',
  })
  end!: string;
}

export class AvailabilityDayDto {
  @IsEnum(DayOfWeekDto)
  dayOfWeek!: DayOfWeekDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityIntervalDto)
  intervals!: AvailabilityIntervalDto[];
}

export class SetAvailabilityDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityDayDto)
  days!: AvailabilityDayDto[];
}