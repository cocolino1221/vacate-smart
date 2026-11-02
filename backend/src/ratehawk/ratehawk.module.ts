import { Global, Module } from '@nestjs/common';
import { RateHawkClient } from './ratehawk.client';

@Global()
@Module({ providers: [RateHawkClient], exports: [RateHawkClient] })
export class RateHawkModule {}
