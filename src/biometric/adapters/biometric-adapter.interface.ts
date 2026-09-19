/**
 * Normalized biometric event after brand-specific adapters parse raw payloads.
 * Never includes fingerprint/face templates — IDs and timestamps only.
 */
export interface NormalizedBiometricEvent {
  deviceSerial: string;
  biometricId: number;
  eventTimestamp: Date;
  rawPunchType?: string | null;
  rawPayload?: string | null;
}

export interface BiometricAdapterParseResult {
  events: NormalizedBiometricEvent[];
  /** Device serial from query/header when body has no ATTLOG rows (heartbeat). */
  deviceSerial?: string | null;
  isHeartbeat: boolean;
}
