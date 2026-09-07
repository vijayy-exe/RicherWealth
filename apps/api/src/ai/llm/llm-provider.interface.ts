export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionResult {
  text: string;
  modelUsed: string;
}

/**
 * One interface, three implementations (Claude, Ollama, plus whichever a
 * future OpenAI provider would add) — LlmOrchestratorService is the only
 * thing that decides which one actually runs. No caller outside this
 * directory should import a specific provider directly.
 */
export interface LlmProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(messages: LlmMessage[]): Promise<LlmCompletionResult>;
  /** Yields text chunks as they arrive. Providers that can't stream natively
   * (none of the two built here — both support it) would yield once. */
  streamComplete(messages: LlmMessage[]): AsyncIterable<string>;
}
