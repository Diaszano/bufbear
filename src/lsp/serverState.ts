export type ServerState = "starting" | "ready" | "degraded" | "stopped" | "error";

export interface RootServerStatus {
  readonly root: string;
  readonly state: ServerState;
  readonly detail?: string;
}
