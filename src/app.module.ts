import { Module } from '@nestjs/common';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    BackupModule.forRoot({
      labelPrefix: process.env.LABEL_PREFIX,
      backupDir: process.env.BACKUP_DIR,
      cronSchedule: process.env.CRON_SCHEDULE
    }),
  ],
})
export class AppModule {}
