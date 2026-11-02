import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { round2 } from '../common/utils';

export interface Markup {
  percent: number;
  fixed: number;
}

/** Calculează prețul de vânzare = preț net RateHawk + adaos comercial. */
@Injectable()
export class PricingService {
  private cache: { at: number; rules: Map<ProductType, Markup> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getMarkup(product: ProductType): Promise<Markup> {
    if (!this.cache || Date.now() - this.cache.at > 60_000) {
      const rows = await this.prisma.markupRule.findMany().catch(() => []);
      const rules = new Map<ProductType, Markup>();
      for (const r of rows) rules.set(r.product, { percent: Number(r.percent), fixed: Number(r.fixed) });
      this.cache = { at: Date.now(), rules };
    }
    return (
      this.cache.rules.get(product) ?? {
        percent: this.config.get<number>(`markup.${product}`) ?? 10,
        fixed: 0,
      }
    );
  }

  invalidate() {
    this.cache = null;
  }

  static apply(net: number, m: Markup): number {
    // rotunjim în sus la cenți ca să nu vindem niciodată sub prețul net
    return Math.ceil(round2(net * (1 + m.percent / 100) + m.fixed) * 100) / 100;
  }

  async sellPrice(product: ProductType, net: number): Promise<number> {
    return PricingService.apply(net, await this.getMarkup(product));
  }
}
