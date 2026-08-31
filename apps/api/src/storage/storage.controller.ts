import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { UserWithRelations } from "../auth/auth.service";
import { IsString } from "class-validator";

class SignUploadDto {
  @IsString() assetId!: string;
  @IsString() filename!: string;
  @IsString() mimeType!: string;
}

@Controller("storage")
@UseGuards(SupabaseAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post("sign")
  getUploadUrl(@CurrentUser() user: UserWithRelations, @Body() dto: SignUploadDto) {
    return this.storageService.getUploadUrl(user.id, dto.assetId, dto.filename, dto.mimeType);
  }
}
