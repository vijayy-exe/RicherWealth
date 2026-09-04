import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { IncomeService } from "./income.service";
import { CreateIncomeDto, UpdateIncomeDto } from "./dto/income.dto";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { UserWithRelations } from "../auth/auth.service";

@Controller("income")
@UseGuards(SupabaseAuthGuard)
export class IncomeController {
  constructor(private readonly incomeService: IncomeService) {}

  @Get()
  findAll(@CurrentUser() user: UserWithRelations, @Query("sourceType") sourceType?: string) {
    return this.incomeService.findAll(user.id, sourceType);
  }

  // Must come before @Get(":id") — otherwise "monthly-passive" would be captured as :id.
  @Get("monthly-passive")
  getMonthlyPassiveIncome(@CurrentUser() user: UserWithRelations) {
    return this.incomeService.getMonthlyPassiveIncome(user.id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.incomeService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithRelations, @Body() dto: CreateIncomeDto) {
    return this.incomeService.create(user.id, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: UserWithRelations, @Param("id") id: string, @Body() dto: UpdateIncomeDto) {
    return this.incomeService.update(user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.incomeService.remove(user.id, id);
  }
}
