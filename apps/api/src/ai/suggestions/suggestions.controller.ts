import { Body, Controller, Get, Param, Post, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../../auth/guards/supabase-auth.guard";
import { SuggestionEngineService } from "./suggestion-engine.service";

interface AuthRequest {
  user: { id: string };
}

@Controller("ai/suggestions")
@UseGuards(SupabaseAuthGuard)
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionEngineService) {}

  @Get()
  listActive(@Request() req: AuthRequest) {
    return this.suggestions.listActive(req.user.id);
  }

  @Post("generate")
  generate(@Request() req: AuthRequest) {
    return this.suggestions.generateForUser(req.user.id);
  }

  @Post(":id/status")
  setStatus(@Request() req: AuthRequest, @Param("id") id: string, @Body() body: { status: "DISMISSED" | "ACTED_ON" }) {
    return this.suggestions.setStatus(req.user.id, id, body.status);
  }
}
