import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { GoalsService } from "./goals.service";
import { CreateGoalDto, UpdateGoalDto, SuccessProbabilityQueryDto } from "./dto/goal.dto";

interface AuthRequest {
  user: { id: string };
}

@Controller("goals")
@UseGuards(SupabaseAuthGuard)
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  findAll(@Request() req: AuthRequest) {
    return this.goals.findAll(req.user.id);
  }

  @Get(":id")
  findOne(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.goals.findOne(req.user.id, id);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateGoalDto) {
    return this.goals.create(req.user.id, dto);
  }

  @Patch(":id")
  update(@Request() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateGoalDto) {
    return this.goals.update(req.user.id, id, dto);
  }

  @Delete(":id")
  remove(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.goals.remove(req.user.id, id);
  }

  @Get(":id/success-probability")
  getSuccessProbability(@Request() req: AuthRequest, @Param("id") id: string, @Query() query: SuccessProbabilityQueryDto) {
    return this.goals.getSuccessProbability(req.user.id, id, query.monthlyContribution);
  }
}
