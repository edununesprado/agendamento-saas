import {
  IsEmail,
  IsIn,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTeamMemberDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn([
    'ADMIN',
    'RECEPTIONIST',
    'STAFF',
  ])
  role!:
    | 'ADMIN'
    | 'RECEPTIONIST'
    | 'STAFF';
}