export type MaintenanceConfig = {
  enabled: boolean;
  message: string;
  estimatedMinutes: number | null;
};

export const MAINTENANCE_SETTINGS_KEY = 'maintenance_mode';

export const DEFAULT_MAINTENANCE: MaintenanceConfig = {
  enabled: false,
  message:
    "We're currently performing scheduled maintenance to improve your shopping experience. We'll be back online shortly.",
  estimatedMinutes: 30,
};

export function normalizeMaintenance(raw: unknown): MaintenanceConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const minutes = obj.estimatedMinutes ?? obj.estimated_minutes;
  return {
    enabled: Boolean(obj.enabled),
    message:
      typeof obj.message === 'string' && obj.message.trim()
        ? obj.message.trim()
        : DEFAULT_MAINTENANCE.message,
    estimatedMinutes:
      minutes === null || minutes === undefined || minutes === ''
        ? null
        : Number.isFinite(Number(minutes))
          ? Math.max(0, Math.round(Number(minutes)))
          : DEFAULT_MAINTENANCE.estimatedMinutes,
  };
}
