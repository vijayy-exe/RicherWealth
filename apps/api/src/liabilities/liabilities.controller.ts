import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { LiabilitiesService } from "./liabilities.service";
import { CreateLiabilityDto, UpdateLiabilityDto, CalculateAmortizationDto, PrepaymentSavingsQueryDto } from "./dto/liability.dto";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { UserWithRelations } from "../auth/auth.service";

@Controller("liabilities")
@UseGuards(SupabaseAuthGuard)
export class LiabilitiesController {
  constructor(private readonly liabilitiesService: LiabilitiesService) {}

  @Get()
  findAll(@CurrentUser() user: UserWithRelations, @Query("type") type?: string) {
    return this.liabilitiesService.findAll(user.id, type);
  }

  // Must come before @Get(":id") — otherwise "summary" would be captured as :id.
  @Get("summary")
  getSummary(@CurrentUser() user: UserWithRelations, @Query("type") type?: string) {
    return this.liabilitiesService.getPortfolioSummary(user.id, type);
  }

  // Must come before @Get(":id") for the same reason.
  @Get("upcoming-dues")
  getUpcomingDues(@CurrentUser() user: UserWithRelations) {
    return this.liabilitiesService.getUpcomingDues(user.id);
  }

  // Standalone calculator — not tied to a saved liability. Must come before
  // @Get(":id")/@Post(":id/...") since "amortization" would otherwise be
  // captured as an :id segment.
  @Post("amortization/calculate")
  calculateAmortization(@Body() dto: CalculateAmortizationDto) {
    return this.liabilitiesService.calculateStandalone(dto);
  }

  @Get(":id")
  findOne(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.liabilitiesService.findOne(user.id, id);
  }

  @Get(":id/amortization")
  getAmortizationSchedule(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.liabilitiesService.getAmortizationSchedule(user.id, id);
  }

  @Get(":id/prepayment-savings")
  getPrepaymentSavings(
    @CurrentUser() user: UserWithRelations,
    @Param("id") id: string,
    @Query() query: PrepaymentSavingsQueryDto,
  ) {
    return this.liabilitiesService.getPrepaymentSavings(user.id, id, query.extraPayment);
  }

  @Get(":id/credit-card-payoff")
  getCreditCardPayoff(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.liabilitiesService.getCreditCardPayoff(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithRelations, @Body() dto: CreateLiabilityDto) {
    return this.liabilitiesService.create(user.id, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: UserWithRelations, @Param("id") id: string, @Body() dto: UpdateLiabilityDto) {
    return this.liabilitiesService.update(user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.liabilitiesService.remove(user.id, id);
  }
}
