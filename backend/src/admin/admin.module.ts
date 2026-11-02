import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { OrdersModule } from '../orders/orders.module';

@Module({ imports: [OrdersModule], controllers: [AdminController], providers: [AdminGuard] })
export class AdminModule {}
