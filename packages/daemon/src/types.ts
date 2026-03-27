/**
 * Log severity levels, ordered from most to least verbose.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * A single structured log entry written as JSON-lines.
 */
export interface LogEntry {
  /** ISO-8601 timestamp */
  ts: string;
  level: LogLevel;
  msg: string;
  data?: Record<string, unknown>;
}

/**
 * Top-level daemon configuration, loaded from YAML.
 */
export interface DaemonConfig {
  discord?: {
    token: string;
    guild_id: string;
    owner_id: string;
  };
  projects: {
    scan_roots: string[];
  };
  log: {
    file: string;
    level: LogLevel;
    max_size_mb: number;
  };
}
