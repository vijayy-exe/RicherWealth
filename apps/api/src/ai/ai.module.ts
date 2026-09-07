import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";

import { AssetsModule } from "../assets/assets.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { GoalsModule } from "../goals/goals.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { TaxModule } from "../tax/tax.module";

import { AiController } from "./ai.controller";
import { EmbeddingService } from "./rag/embedding.service";
import { EmbeddingRepository } from "./rag/embedding.repository";
import { IndexingService } from "./rag/indexing.service";
import { RetrievalService } from "./rag/retrieval.service";
import { ClaudeProvider } from "./llm/claude.provider";
import { OllamaProvider } from "./llm/ollama.provider";
import { LlmOrchestratorService } from "./llm/llm-orchestrator.service";
import { ChatService } from "./chat/chat.service";
import { ChatController } from "./chat/chat.controller";
import { AiReportService } from "./reports/ai-report.service";
import { AiReportProcessor, AI_REPORTS_QUEUE } from "./reports/ai-report.processor";
import { AiReportScheduler } from "./reports/ai-report.scheduler";
import { SuggestionEngineService } from "./suggestions/suggestion-engine.service";
import { SuggestionsController } from "./suggestions/suggestions.controller";

@Module({
  imports: [
    ConfigModule,
    AssetsModule,
    TransactionsModule,
    GoalsModule,
    NetWorthModule,
    AnalyticsModule,
    TaxModule,
    BullModule.registerQueue({ name: AI_REPORTS_QUEUE }),
  ],
  controllers: [AiController, ChatController, SuggestionsController],
  providers: [
    EmbeddingService,
    EmbeddingRepository,
    IndexingService,
    RetrievalService,
    ClaudeProvider,
    OllamaProvider,
    LlmOrchestratorService,
    ChatService,
    AiReportService,
    AiReportProcessor,
    AiReportScheduler,
    SuggestionEngineService,
  ],
  exports: [LlmOrchestratorService, RetrievalService],
})
export class AiModule {}
