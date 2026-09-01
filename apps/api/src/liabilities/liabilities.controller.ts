import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { LiabilitiesService } from "./liabilities.service";
import { CreateLiabilityDto, UpdateLiabilityDto } from "./dto/liability.dto";
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

  @Get(":id")
  findOne(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.liabilitiesService.findOne(user.id, id);
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
