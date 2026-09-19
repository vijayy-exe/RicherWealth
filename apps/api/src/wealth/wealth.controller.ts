import { BadRequestException, Body, Controller, Get, Post, Query, Request, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { ScenarioSimulatorService } from "./scenario-simulator.service";
import { WealthHealthService } from "./wealth-health.service";
import { TimeMachineService } from "./time-machine.service";
import { WealthDnaService } from "./wealth-dna.service";
import { SimulateScenarioDto } from "./dto/simulate-scenario.dto";
import { WealthHealthQueryDto } from "./dto/wealth-health-query.dto";
import { PastStateQueryDto, ProjectForwardQueryDto } from "./dto/time-machine-query.dto";
import { RefreshQueryDto } from "./dto/refresh-query.dto";

interface AuthRequest {
  user: { id: string };
}

@Controller("wealth")
@UseGuards(SupabaseAuthGuard)
export class WealthController {
  constructor(
    private readonly scenarioSimulator: ScenarioSimulatorService,
    private readonly wealthHealth: WealthHealthService,
    private readonly timeMachine: TimeMachineService,
    private readonly wealthDna: WealthDnaService,
  ) {}

  @Post("simulate-scenario")
  simulateScenario(@Request() req: AuthRequest, @Body() dto: SimulateScenarioDto) {
    return this.scenarioSimulator.simulate(req.user.id, dto);
  }

  @Get("health-score")
  getHealthScore(@Request() req: AuthRequest, @Query() query: WealthHealthQueryDto) {
    return this.wealthHealth.getScore(req.user.id, query.countryCode ?? "US", query.refresh ?? false);
  }

  @Get("time-machine/timeline")
  getTimeline(@Request() req: AuthRequest) {
    return this.timeMachine.getTimeline(req.user.id);
  }

  @Get("time-machine/past-state")
  getPastState(@Request() req: AuthRequest, @Query() query: PastStateQueryDto) {
    const date = new Date(query.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date");
    return this.timeMachine.reconstructPastState(req.user.id, date);
  }

  @Get("time-machine/project-forward")
  projectForward(@Request() req: AuthRequest, @Query() query: ProjectForwardQueryDto) {
    return this.timeMachine.projectForward(req.user.id, query.horizonYears ?? 10, query.monthlyContribution ?? 0);
  }

  @Get("wealth-dna")
  getWealthDna(@Request() req: AuthRequest, @Query() query: RefreshQueryDto) {
    return this.wealthDna.getProfile(req.user.id, query.refresh ?? false);
  }
}
