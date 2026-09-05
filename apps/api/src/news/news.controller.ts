import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { NewsService } from "./news.service";

interface AuthRequest {
  user: { id: string };
}

/** Public — general market news, no personalization, no user data. */
@Controller("news")
export class NewsPublicController {
  constructor(private readonly news: NewsService) {}

  @Get("general")
  getGeneral() {
    return this.news.getGeneralNews();
  }
}

/** Protected — the "News relevant to your portfolio" feed. */
@Controller("news")
@UseGuards(SupabaseAuthGuard)
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get("personalized")
  getPersonalized(@Request() req: AuthRequest) {
    return this.news.getPersonalizedNews(req.user.id);
  }
}
