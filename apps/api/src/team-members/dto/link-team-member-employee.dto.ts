import {
  IsNotEmpty,
  IsString,
  ValidateIf,
} from 'class-validator';

export class LinkTeamMemberEmployeeDto {
  @ValidateIf(
    (_object, value) =>
      value !== null,
  )
  @IsString()
  @IsNotEmpty()
  employeeId!: string | null;
}