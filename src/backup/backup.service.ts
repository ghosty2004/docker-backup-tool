import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as Dockerode from 'dockerode';
import { CronJob } from 'cron';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { BackupConfig, BackupModuleOptions } from './backup.interfaces';
import { BACKUP_MODULE_OPTIONS } from './backup.constants';

const execAsync = promisify(exec);

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);

  private cronJob: CronJob;
  private docker: Dockerode;

  constructor(
    @Inject(BACKUP_MODULE_OPTIONS)
    private readonly moduleOptions: BackupModuleOptions,
  ) {}

  async onModuleInit() {
    this.logger.verbose(
      `Starting backup tool with schedule: ${this.moduleOptions.cronSchedule}`,
    );

    this.docker = new Dockerode({
      socketPath: '/var/run/docker.sock',
    });

    this.cronJob = CronJob.from({
      cronTime: this.moduleOptions.cronSchedule,
      onTick: this.runBackups.bind(this),
      start: true,
      runOnInit: true,
    });

    await fs.ensureDir(this.moduleOptions.backupDir);
  }

  async onModuleDestroy() {
    this.logger.log('Backup service stopped.');

    await this.cronJob.stop();
  }

  async getBackupContainers() {
    try {
      const containers = await this.docker.listContainers({ all: true });

      return containers.filter((container) => {
        const labels = container.Labels || {};
        return labels[`${this.moduleOptions.labelPrefix}.backup`] === 'true';
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Failed to list containers: ${error.message}`);
      }
      return [];
    }
  }

  extractBackupConfig(container: Dockerode.ContainerInfo): BackupConfig {
    const labels = container.Labels || {};
    const prefix = this.moduleOptions.labelPrefix;

    const config = {
      containerId: container.Id,
      containerName: container.Names[0].replace('/', ''),
      enabled: labels[`${prefix}.backup`] === 'true',
      command: labels[`${prefix}.command`],
      location: labels[`${prefix}.location`] ?? '/tmp/backup',
      schedule: labels[`${prefix}.schedule`],
      retention: parseInt(labels[`${prefix}.retention`]) ?? 7,
      preCommand: labels[`${prefix}.pre_command`],
      postCommand: labels[`${prefix}.post_command`],
    };

    return config;
  }

  async executeBackup(config: BackupConfig): Promise<boolean> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${config.containerName}_${timestamp}`;
    const containerBackupPath = config.location;
    const hostBackupPath = path.join(
      this.moduleOptions.backupDir,
      config.containerName,
    );

    // Ensure container-specific backup directory exists
    await fs.ensureDir(hostBackupPath);

    try {
      const containerObj = this.docker.getContainer(config.containerId);

      // Pre-backup command
      if (config.preCommand) {
        this.logger.verbose(
          `Executing pre-backup command for ${config.containerName}`,
        );
        await this.execInContainer(containerObj, config.preCommand);
      }

      // Main backup command
      this.logger.verbose(
        `Starting backup for container: ${config.containerName}`,
      );

      if (config.command) {
        const fullCommand = `${config.command} > ${containerBackupPath}/${backupFileName}`;
        await this.execInContainer(containerObj, fullCommand);
      }

      // Copy backup file from container to host
      const copyCommand = `docker cp ${config.containerId}:${containerBackupPath}/${backupFileName} ${hostBackupPath}/`;
      await execAsync(copyCommand);

      // Post-backup command
      if (config.postCommand) {
        this.logger.verbose(
          `Executing post-backup command for ${config.containerName}`,
        );
        await this.execInContainer(containerObj, config.postCommand);
      }

      this.logger.verbose(
        `Backup completed for ${config.containerName}: ${backupFileName}`,
      );

      // Cleanup old backups
      await this.cleanupOldBackups(hostBackupPath, config.retention);

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `Backup failed for ${config.containerName}: ${error.message}`,
        );
      }

      return false;
    }
  }

  async execInContainer(container: Dockerode.Container, command: string) {
    return new Promise((resolve, reject) => {
      container.exec(
        {
          Cmd: ['sh', '-c', command],
          AttachStdout: true,
          AttachStderr: true,
        },
        (err: unknown, exec) => {
          if (err && err instanceof Error) return reject(err);

          exec!.start({}, (err: unknown, stream) => {
            if (err && err instanceof Error) return reject(err);

            let output = '';
            stream!.on('data', (data: unknown) => {
              if (typeof data === 'string') {
                output += data.toString();
              }
            });

            stream!.on('end', () => {
              if (output.includes('Error') || output.includes('error')) {
                reject(new Error(output));
              } else {
                resolve(output);
              }
            });
          });
        },
      );
    });
  }

  async cleanupOldBackups(backupPath: string, retention: number) {
    try {
      const files = await fs.readdir(backupPath);
      const backupFiles = files
        .filter((file) => file.includes('_'))
        .map((file) => ({
          name: file,
          path: path.join(backupPath, file),
          mtime: fs.statSync(path.join(backupPath, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (backupFiles.length > retention) {
        const filesToDelete = backupFiles.slice(retention);
        for (const file of filesToDelete) {
          await fs.remove(file.path);
          this.logger.verbose(`Deleted old backup: ${file.name}`);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Failed to cleanup old backups: ${error.message}`);
      }
    }
  }

  async runBackups() {
    this.logger.verbose('Starting backup process...');

    const containers = await this.getBackupContainers();

    if (containers.length === 0) {
      this.logger.verbose('No containers found with backup labels');
      return;
    }

    this.logger.verbose(`Found ${containers.length} containers to backup`);

    const results: { container: string; success: boolean }[] = [];

    for (const container of containers) {
      const config = this.extractBackupConfig(container);

      if (!config.enabled) {
        this.logger.verbose(
          `Backup disabled for container: ${config.containerName}`,
        );
        continue;
      }

      if (!config.command) {
        this.logger.warn(
          `No backup command specified for container: ${config.containerName}`,
        );
        continue;
      }

      const success = await this.executeBackup(config);
      results.push({
        container: config.containerName,
        success,
      });
    }

    // Log summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.verbose(
      `Backup process completed. Successful: ${successful}, Failed: ${failed}`,
    );

    return results;
  }
}
