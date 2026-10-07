import { useLocalSearchParams } from "expo-router";

export type ScreenState = "ready" | "loading" | "empty" | "error";

/**
 * Mock data has no real loading. For reviewing every state, a screen can be
 * opened with ?state=loading|empty|error. Default is ready.
 */
export function useScreenState(): ScreenState {
  const { state } = useLocalSearchParams<{ state?: string }>();
  return state === "loading" || state === "empty" || state === "error" ? state : "ready";
}
