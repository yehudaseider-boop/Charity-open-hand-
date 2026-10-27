import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Updates from "expo-updates";

/** Only in test builds (Expo Go, or the preview update channel), never in the store app. */
export const TEST_BUILD = __DEV__ || Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Updates.channel === "preview";
