import {
  Controller, Get, Post, Delete,
  Param, Body, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { BankSyncService } from "./bank-sync.service";
import { ExchangePublicTokenDto } from "./dto/bank-sync.dto";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { UserWithRelations } from "../auth/auth.service";

@Controller("bank-sync")
@UseGuards(SupabaseAuthGuard)
export class BankSyncController {
  constructor(private readonly bankSync: BankSyncService) {}

  @Get("plaid/status")
  getPlaidStatus() {
    return { configured: this.bankSync.isPlaidConfigured() };
  }

  @Post("plaid/link-token")
  createLinkToken(@CurrentUser() user: UserWithRelations) {
    return this.bankSync.createPlaidLinkToken(user.id);
  }

  @Post("plaid/exchange-token")
  exchangeToken(@CurrentUser() user: UserWithRelations, @Body() dto: ExchangePublicTokenDto) {
    return this.bankSync.exchangePlaidPublicToken(user.id, dto);
  }

  @Get("plaid/items")
  listItems(@CurrentUser() user: UserWithRelations) {
    return this.bankSync.listPlaidItems(user.id);
  }

  @Post("plaid/items/:id/sync")
  syncItem(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.bankSync.syncPlaidItem(user.id, id);
  }

  @Delete("plaid/items/:id")
  disconnectItem(@CurrentUser() user: UserWithRelations, @Param("id") id: string) {
    return this.bankSync.disconnectPlaidItem(user.id, id);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  importStatement(@CurrentUser() user: UserWithRelations, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded — attach a .csv or .pdf bank statement as \"file\".");
    return this.bankSync.importStatement(user.id, file, user.baseCurrency);
  }
}
