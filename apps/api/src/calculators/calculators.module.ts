import { Module } from "@nestjs/common";
import { CalculatorsController } from "./calculators.controller";
import { ForexModule } from "../forex/forex.module";

@Module({
  imports: [ForexModule],
  controllers: [CalculatorsController],
})
export class CalculatorsModule {}
