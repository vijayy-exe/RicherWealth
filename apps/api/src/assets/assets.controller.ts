import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { CreateAssetDto, UpdateAssetDto } from "./dto/asset.dto";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { UserWithRelations } from "../auth/auth.service";

@Controller("assets")
@UseGuards(SupabaseAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  findAll(
    @CurrentUser() user: UserWithRelations,
    @Query("type") type?: string,
  ) {
    return this.assetsService.findAll(user.id, type);
  }

  @Get(":id")
  findOne(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.assetsService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: UserWithRelations, @Body() dto: CreateAssetDto) {
    return this.assetsService.create(user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: UserWithRelations,
    @Param("id") id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.assetsService.remove(user.id, id);
  }
}
