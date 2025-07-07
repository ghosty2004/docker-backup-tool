export interface BackupModuleOptions {
  labelPrefix: string;
  backupDir: string;
  cronSchedule: string;
}

export interface BackupConfig {
  containerId: string;
  containerName: string;
  enabled: boolean;
  command: string;
  location: string;
  schedule: string;
  retention: number;
  preCommand: string;
  postCommand: string;
}
