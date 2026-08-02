import { Body, Controller, Post } from '@nestjs/common';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpService, SendResult, VerifyResult } from './otp.service';

@Controller('otp')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('send')
  send(@Body() dto: SendOtpDto): Promise<SendResult> {
    return this.otp.send(dto.mc_num, dto.channel);
  }

  @Post('verify')
  verify(@Body() dto: VerifyOtpDto): VerifyResult {
    return this.otp.verify(dto.mc_num, dto.code);
  }
}
