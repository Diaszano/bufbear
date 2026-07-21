export type TraceServer = "off" | "messages" | "verbose";

export interface BufBearConfig {
  readonly lspEnabled: boolean;
  readonly bufPath: string;
  readonly traceServer: TraceServer;
  readonly missingBufNotification: boolean;
  readonly goEnabled: boolean;
  readonly goGenRoot: string;
  readonly goSourceRelative: boolean;
  readonly conflictWarningEnabled: boolean;
  readonly formattingEnabled: boolean;
}
