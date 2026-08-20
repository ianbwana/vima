import { IsString, IsPhoneNumber } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  phone: string;
}
