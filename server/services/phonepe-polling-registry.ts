import type { Environment } from "../../shared/payment-providers";
import { createPaymentsService } from "./payments-service";
import { phonePePollingStore } from "../storage";
import { PhonePePollingWorker } from "./phonepe-polling-worker";

const environment: Environment = (process.env.NODE_ENV === "production" ? "live" : "test") as Environment;

export const phonePePollingWorker = new PhonePePollingWorker({
  store: phonePePollingStore,
  getVerificationService: () => createPaymentsService({ environment }),
});

export const startPhonePePollingWorker = async (): Promise<void> => {
  await phonePePollingWorker.start();
};
