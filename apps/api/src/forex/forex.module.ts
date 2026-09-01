import { Module } from "@nestjs/common";
import { CurrencyService } from "./currency.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";

@Module({
  providers: [CurrencyService, MemoryCacheService],
  exports: [CurrencyService],
})
export class ForexModule {}
