import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../auth/guards/supabase-auth.guard";
import { ItrService } from "./itr.service";
import { ItrDiscrepancyService } from "./itr-discrepancy.service";
import { requestItrUploadSchema, registerItrDocumentSchema, confirmItrDocumentSchema } from "../dto/itr.dto";

interface AuthRequest {
  user: { id: string };
}

/**
 * Phase 15 extension: ITR document upload & analysis. Mounted under
 * /api/tax/itr/* (TaxController owns /api/tax/*).
 */
@Controller("tax/itr")
@UseGuards(SupabaseAuthGuard)
export class ItrController {
  constructor(
    private readonly itr: ItrService,
    private readonly discrepancies: ItrDiscrepancyService,
  ) {}

  @Post("upload-url")
  async getUploadUrl(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = requestItrUploadSchema.parse(body);
    return this.itr.requestUploadUrl(req.user.id, dto);
  }

  @Post("register")
  async register(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = registerItrDocumentSchema.parse(body);
    return this.itr.registerAndProcess(req.user.id, dto);
  }

  @Get()
  async list(@Request() req: AuthRequest) {
    return this.itr.findAll(req.user.id);
  }

  @Get("trend")
  async trend(@Request() req: AuthRequest) {
    return this.itr.getYearlyTrend(req.user.id);
  }

  @Get(":id")
  async getOne(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.itr.findOne(req.user.id, id);
  }

  @Post(":id/confirm")
  async confirm(@Request() req: AuthRequest, @Param("id") id: string, @Body() body: unknown) {
    const dto = confirmItrDocumentSchema.parse(body);
    return this.itr.confirm(req.user.id, id, dto);
  }

  @Get(":id/discrepancies")
  async getDiscrepancies(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.discrepancies.getDiscrepancies(req.user.id, id);
  }

  @Delete(":id")
  async remove(@Request() req: AuthRequest, @Param("id") id: string) {
    await this.itr.delete(req.user.id, id);
    return { deleted: true };
  }
}
