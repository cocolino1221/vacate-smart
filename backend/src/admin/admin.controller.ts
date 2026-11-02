import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { OrderStatus, ProductType } from '@prisma/client';
import { IsNumber, Max, Min } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

class MarkupDto {
  @IsNumber() @Min(0) @Max(100) percent: number;
  @IsNumber() @Min(0) fixed: number;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  @Get('orders')
  list(@Query('status') status?: OrderStatus, @Query('q') q?: string, @Query('skip') skip?: string) {
    return this.orders.list({ status, q, skip: skip ? parseInt(skip, 10) : 0 });
  }

  @Post('orders/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.orders.cancel(id);
  }

  @Get('markup')
  async markups() {
    return Promise.all(Object.values(ProductType).map(async (p) => ({ product: p, ...(await this.pricing.getMarkup(p)) })));
  }

  @Put('markup/:product')
  async setMarkup(@Param('product', new ParseEnumPipe(ProductType)) product: ProductType, @Body() dto: MarkupDto) {
    const r = await this.prisma.markupRule.upsert({
      where: { product },
      create: { product, percent: dto.percent, fixed: dto.fixed },
      update: { percent: dto.percent, fixed: dto.fixed },
    });
    this.pricing.invalidate();
    return r;
  }

  @Get('stats')
  async stats() {
    const rows = await this.prisma.order.groupBy({
      by: ['status', 'currency'],
      _count: { _all: true },
      _sum: { sellAmount: true, netAmount: true },
    });
    return rows.map((r) => ({
      status: r.status,
      currency: r.currency,
      orders: r._count._all,
      revenue: Number(r._sum.sellAmount ?? 0),
      cost: Number(r._sum.netAmount ?? 0),
      margin: Number(r._sum.sellAmount ?? 0) - Number(r._sum.netAmount ?? 0),
    }));
  }
}
