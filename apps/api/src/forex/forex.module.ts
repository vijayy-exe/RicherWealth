import { Module } from "@nestjs/common";
import { ForexService } from "./forex.service";

@Module({
  providers: [ForexService],
  exports: [ForexService],
})
export class ForexModule {}
