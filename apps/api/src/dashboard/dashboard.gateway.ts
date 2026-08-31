import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Server, Socket } from "socket.io";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaService } from "../prisma/prisma.service";

interface NetWorthUpdatedPayload {
  userId: string;
  snapshot: {
    netWorth: unknown;
    totalAssets: unknown;
    totalLiabilities: unknown;
    baseCurrency: string;
    snapshotDate: Date;
  };
}

/**
 * DashboardGateway — real-time WebSocket channel.
 *
 * On connect: validates the Supabase JWT from handshake auth,
 * joins the socket to a private room (`user:{userId}`).
 *
 * Listens for `net-worth.updated` events (emitted by NetWorthService)
 * and broadcasts `net-worth-update` to the relevant user room.
 */
@WebSocketGateway({
  cors: {
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  },
  namespace: "/dashboard",
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private readonly supabase;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>("SUPABASE_URL") ?? "";
    const key = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const token = socket.handshake.auth["token"] as string | undefined;

    if (!token) {
      this.logger.warn(`Socket ${socket.id} rejected: no token`);
      socket.disconnect();
      return;
    }

    try {
      const { data, error } = await this.supabase.auth.getUser(token);
      if (error || !data.user) {
        socket.disconnect();
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { supabaseId: data.user.id },
        select: { id: true },
      });

      if (!user) {
        socket.disconnect();
        return;
      }

      await socket.join(`user:${user.id}`);
      socket.data.userId = user.id;
      this.logger.debug(`Socket ${socket.id} authenticated as user ${user.id}`);
    } catch (err) {
      this.logger.error("WebSocket auth error", err);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug(`Socket ${socket.id} disconnected`);
  }

  @OnEvent("net-worth.updated")
  handleNetWorthUpdated(payload: NetWorthUpdatedPayload): void {
    const room = `user:${payload.userId}`;
    this.server.to(room).emit("net-worth-update", {
      netWorth: Number(payload.snapshot.netWorth),
      totalAssets: Number(payload.snapshot.totalAssets),
      totalLiabilities: Number(payload.snapshot.totalLiabilities),
      baseCurrency: payload.snapshot.baseCurrency,
      updatedAt: payload.snapshot.snapshotDate,
    });
    this.logger.debug(`Pushed net-worth-update to room ${room}`);
  }

  @OnEvent("stock-price.updated")
  handleStockPriceTick(payload: {
    userId: string;
    ticker: string;
    exchange: string;
    livePrice: number;
  }): void {
    const room = `user:${payload.userId}`;
    this.server.to(room).emit("stock-price-tick", {
      key: `${payload.exchange}:${payload.ticker}`,
      price: payload.livePrice,
      updatedAt: new Date().toISOString(),
    });
    this.logger.debug(`Pushed stock-price-tick for ${payload.ticker} to room ${room}`);
  }
}
