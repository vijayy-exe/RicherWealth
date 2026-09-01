import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { EtfsService, type CreateEtfHoldingDto } from "./etfs.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("etfs")
@UseGuards(SupabaseAuthGuard)
export class EtfsController {
  constructor(private readonly etfs: EtfsService) {}

  @Get("holdings")
  listHoldings(@Request() req: AuthRequest) {
    return this.etfs.listHoldings(req.user.id);
  }

  @Post("holdings")
  createHolding(@Request() req: AuthRequest, @Body() dto: CreateEtfHoldingDto) {
    return this.etfs.createHolding(req.user.id, dto);
  }

  @Delete("holdings/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteHolding(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.etfs.deleteHolding(req.user.id, assetId);
  }
}
