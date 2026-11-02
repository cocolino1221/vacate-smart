import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { CacheModule } from './cache/cache.module';
import { RateHawkModule } from './ratehawk/ratehawk.module';
import { PricingModule } from './pricing/pricing.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HotelsModule } from './products/hotels/hotels.module';
import { FlightsModule } from './products/flights/flights.module';
import { TransfersModule } from './products/transfers/transfers.module';
import { RailModule } from './products/rail/rail.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CacheModule,
    RateHawkModule,
    PricingModule,
    PaymentsModule,
    NotificationsModule,
    HotelsModule,
    FlightsModule,
    TransfersModule,
    RailModule,
    OrdersModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
