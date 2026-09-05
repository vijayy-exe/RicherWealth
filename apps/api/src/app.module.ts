import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { join } from "path";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ForexModule } from "./forex/forex.module";
import { NetWorthModule } from "./net-worth/net-worth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { AssetsModule } from "./assets/assets.module";
import { LiabilitiesModule } from "./liabilities/liabilities.module";
import { StorageModule } from "./storage/storage.module";
import { StocksModule } from "./stocks/stocks.module";
// Phase 5
import { MutualFundsModule } from "./mutual-funds/mutual-funds.module";
import { EtfsModule } from "./etfs/etfs.module";
import { BondsModule } from "./bonds/bonds.module";
// Phase 6
import { CryptoModule } from "./crypto/crypto.module";
// Phase 7
import { PreciousMetalsModule } from "./precious-metals/precious-metals.module";
import { CommoditiesModule } from "./commodities/commodities.module";
// Phase 8
import { RealEstateModule } from "./real-estate/real-estate.module";
// Phase 10
import { IncomeModule } from "./income/income.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { BankSyncModule } from "./bank-sync/bank-sync.module";
// Phase 11
import { AnalyticsModule } from "./analytics/analytics.module";
// Phase 12
import { RiskEngineModule } from "./risk/risk-engine.module";
// Phase 13
import { GoalsModule } from "./goals/goals.module";
import { CalculatorsModule } from "./calculators/calculators.module";
// Phase 14
import { MarketIntelligenceModule } from "./market-intelligence/market-intelligence.module";
import { NewsModule } from "./news/news.module";
// Phase 15
import { TaxModule } from "./tax/tax.module";
import { VaultModule } from "./vault/vault.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env", "../../.env.local", "../../.env"],
    }),

    // Event bus for decoupled module communication (e.g. net-worth → WebSocket)
    EventEmitterModule.forRoot(),

    // Cron job infrastructure
    ScheduleModule.forRoot(),

    // GraphQL — code-first, schema auto-generated
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),
      sortSchema: true,
      context: ({ req }: { req: unknown }) => ({ req }),
      playground: process.env["NODE_ENV"] !== "production",
    }),

    // Core
    PrismaModule,

    // Domain modules
    AuthModule,
    ForexModule,
    NetWorthModule,
    DashboardModule,
    AssetsModule,
    LiabilitiesModule,
    StorageModule,
    StocksModule,
    // Phase 5
    MutualFundsModule,
    EtfsModule,
    BondsModule,
    // Phase 6
    CryptoModule,
    // Phase 7
    PreciousMetalsModule,
    CommoditiesModule,
    // Phase 8
    RealEstateModule,
    // Phase 10
    IncomeModule,
    TransactionsModule,
    BankSyncModule,
    // Phase 11
    AnalyticsModule,
    // Phase 12
    RiskEngineModule,
    // Phase 13
    GoalsModule,
    CalculatorsModule,
    // Phase 14
    MarketIntelligenceModule,
    NewsModule,
    // Phase 15
    TaxModule,
    VaultModule,

    // Phase 3+
    // AssetsModule,
    // LiabilitiesModule,
    // AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
