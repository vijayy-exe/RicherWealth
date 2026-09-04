import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { CreateTransactionDto, UpdateTransactionDto, RecategorizeTransactionDto, TransactionQueryDto } from "./dto/transaction.dto";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { UserWithRelations } from "../auth/auth.service";

@Controller("transactions")
@UseGuards(SupabaseAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  findAll(@CurrentUser() user: UserWithRelations, @Query() query: TransactionQueryDto) {
    return this.transactionsService.findAll(user.id, query);
  }

  // Literal routes must come before @Get(":id") — same convention as liabilities.controller.ts.
  @Get("cash-flow")
  getCashFlow(@CurrentUser() user: UserWithRelations, @Query("months") months?: string) {
    return this.transactionsService.getCashFlow(user.id, months ? parseInt(months, 10) : undefined);
  }

  @Get("subscriptions")
  getSubscriptions(@CurrentUser() user: UserWithRelations) {
    return this.transactionsService.getSubscriptions(user.id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.transactionsService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithRelations, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(user.id, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: UserWithRelations, @Param("id") id: string, @Body() dto: UpdateTransactionDto) {
    return this.transactionsService.update(user.id, id, dto);
  }

  @Patch(":id/category")
  recategorize(@CurrentUser() user: UserWithRelations, @Param("id") id: string, @Body() dto: RecategorizeTransactionDto) {
    return this.transactionsService.recategorize(user.id, id, dto.category);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.transactionsService.remove(user.id, id);
  }
}
