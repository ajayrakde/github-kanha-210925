import type { Environment, PhonePeConfig } from "../../shared/payment-providers";

export function resolvePhonePeHost(config: PhonePeConfig, environment: Environment): string {
  const selection = typeof config.activeHost === 'string' ? config.activeHost.trim() : '';

  if (selection) {
    if (selection === 'uat' || selection === 'prod') {
      return config.hosts[selection];
    }

    return selection;
  }

  return environment === 'live'
    ? config.hosts.prod
    : config.hosts.uat;
}
