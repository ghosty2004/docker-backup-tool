import { DynamicModule, Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BACKUP_MODULE_OPTIONS } from './backup.constants';
import { BackupModuleOptions } from './backup.interfaces';

@Module({})
export class BackupModule {
  static forRoot(options?: Partial<BackupModuleOptions>): DynamicModule {
    const optionsWithDefaults: Partial<BackupModuleOptions> = {
      backupDir: '/backups',
      cronSchedule: '0 2 * * *', // Daily at 2AM
      labelPrefix: 'docker-backup-tool',
      ...options,
    };

    return {
      global: true,
      module: BackupModule,
      providers: [
        BackupService,
        {
          provide: BACKUP_MODULE_OPTIONS,
          useValue: optionsWithDefaults,
        },
      ],
      exports: [BackupService],
    };
  }
}
