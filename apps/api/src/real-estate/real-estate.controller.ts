import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { RealEstateService, type CreateRealEstateDto, type UpdateRealEstateDto } from "./real-estate.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("real-estate")
@UseGuards(SupabaseAuthGuard)
export class RealEstateController {
  constructor(private readonly realEstate: RealEstateService) {}

  @Get("properties")
  listProperties(@Request() req: AuthRequest) {
    return this.realEstate.listProperties(req.user.id);
  }

  @Get("properties/:id")
  getProperty(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.realEstate.getProperty(req.user.id, assetId);
  }

  @Post("properties")
  createProperty(@Request() req: AuthRequest, @Body() dto: CreateRealEstateDto) {
    return this.realEstate.createProperty(req.user.id, dto);
  }

  @Patch("properties/:id")
  updateProperty(@Request() req: AuthRequest, @Param("id") assetId: string, @Body() dto: UpdateRealEstateDto) {
    return this.realEstate.updateProperty(req.user.id, assetId, dto);
  }

  @Delete("properties/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProperty(@Request() req: AuthRequest, @Param("id") assetId: string) {
    return this.realEstate.deleteProperty(req.user.id, assetId);
  }
}
