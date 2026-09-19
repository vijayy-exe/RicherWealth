import { Module } from "@nestjs/common";
import { WealthController } from "./wealth.controller";
import { ScenarioSimulatorService } from "./scenario-simulator.service";
import { WealthHealthService } from "./wealth-health.service";
import { TimeMachineService } from "./time-machine.service";
import { WealthDnaService } from "./wealth-dna.service";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { RiskEngineModule } from "../risk/risk-engine.module";
import { IncomeModule } from "../income/income.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { TaxModule } from "../tax/tax.module";
import { GoalsModule } from "../goals/goals.module";
import { StocksModule } from "../stocks/stocks.module";
import { ForexModule } from "../forex/forex.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [
    NetWorthModule,
    AnalyticsModule,
    RiskEngineModule,
    IncomeModule,
    TransactionsModule,
    TaxModule,
    GoalsModule,
    StocksModule, // for MemoryCacheService (WealthHealthService's Redis fallback), mirrors AnalyticsModule/RiskEngineModule
    ForexModule, // for CurrencyService (TimeMachineService's past-allocation currency conversion)
    AiModule, // for LlmOrchestratorService (WealthDnaService's narrative generation) -- one-way import, AiModule never imports WealthModule
  ],
  controllers: [WealthController],
  providers: [ScenarioSimulatorService, WealthHealthService, TimeMachineService, WealthDnaService],
  exports: [ScenarioSimulatorService, WealthHealthService, TimeMachineService, WealthDnaService],
})
export class WealthModule {}
