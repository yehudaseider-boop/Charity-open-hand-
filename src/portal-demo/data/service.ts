/**
 * The portal's data boundary. Screens never import the generator: they go through this
 * API, so swapping the mock for real authenticated calls (Supabase, row-level security)
 * changes this file only. See docs/charity-portal/integration-map.md.
 */
import { DEMO_CHARITIES } from "./charities";
import type { FeeModel } from "./demo-config";
import { generateDataset } from "./generate";
import type { DemoCharity, DemoDataset } from "./types";

export interface PortalApi {
  /** Charities the signed-in person administers. */
  listCharities(): Promise<DemoCharity[]>;
  /** One charity's portal data. The real API returns this in pieces, per screen and date range. */
  loadCharity(charityId: string, feeModel: FeeModel): Promise<DemoDataset>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mock API: generated demo data, with a short delay so loading states can be seen. */
export const mockPortalApi: PortalApi = {
  async listCharities() {
    return DEMO_CHARITIES;
  },
  async loadCharity(charityId, feeModel) {
    await wait(450);
    return generateDataset(charityId, feeModel);
  },
};
