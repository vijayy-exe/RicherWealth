import { Body, Controller, Get, Param, Post, Res, UseGuards, Request } from "@nestjs/common";
import type { Response } from "express";
import { SupabaseAuthGuard } from "../../auth/guards/supabase-auth.guard";
import { ChatService } from "./chat.service";

interface AuthRequest {
  user: { id: string };
}

/**
 * Streaming over a plain authenticated POST + `fetch`/ReadableStream on the
 * client, not native `EventSource` — EventSource can't send an
 * Authorization header, and every other endpoint in this app is bearer-
 * token authenticated, so this stays consistent rather than inventing a
 * cookie-based exception just for chat.
 */
@Controller("ai/chat")
@UseGuards(SupabaseAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("conversations")
  listConversations(@Request() req: AuthRequest) {
    return this.chat.listConversations(req.user.id);
  }

  @Get("conversations/:id/messages")
  getMessages(@Request() req: AuthRequest, @Param("id") id: string) {
    return this.chat.getMessages(req.user.id, id);
  }

  @Post("stream")
  async stream(
    @Request() req: AuthRequest,
    @Res() res: Response,
    @Body() body: { conversationId?: string; message: string },
  ) {
    const conversationId = await this.chat.getOrCreateConversation(req.user.id, body.conversationId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Conversation-Id", conversationId);
    res.flushHeaders();

    try {
      for await (const event of this.chat.streamReply(req.user.id, conversationId, body.message)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Unknown error" })}\n\n`);
    } finally {
      res.end();
    }
  }
}
