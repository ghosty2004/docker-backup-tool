# Docker backup tool

This tool can make backups trought label discovery of your containers

## Features

- Label-based discovery: Automatically finds containers with backup labels
- Flexible backup commands: Execute any command inside containers
- Scheduled backups: Configurable cron schedule
- Retention management: Automatically cleanup old backups
- Pre/post commands: Execute commands before and after backup
- Logging: Comprehensive logging

## Configuration

### Environment Variables

| Variable      | Default            | Description                |
| ------------- | ------------------ | -------------------------- |
| LABEL_PREFIX  | docker-backup-tool | Prefix for backup labels   |
| BACKUP_DIR    | /backups           | Host directory for backups |
| CRON_SCHEDULE | 0 2 \* \* \*       | Cron schedule for backups  |

### Backup Labels

Add these labels to containers you want to backup:

#### Required Labels

- `{prefix}.backup=true` - Enable backup for this container
- `{prefix}.command` - Backup command to execute

#### Optional Labels

- `{prefix}.location` - Path inside container for backup files (default: `/tmp/backup`)
- `{prefix}.retention` - Number of backups to keep (default: 7)
- `{prefix}.pre_command` - Command to run before backup
- `{prefix}.post_command` - Command to run after backup
- `{prefix}.schedule` - Container-specific cron schedule (overrides global)

### Examples

#### MySQL Database Backup

```yaml
services:
  docker-backup-tool:
    image: ghcr.io/ghosty2004/docker-backup-tool:latest
    container_name: backup-tool
    environment:
      LABEL_PREFIX: docker-backup-tool
      BACKUP_DIR: /backups
      CRON_SCHEDULE: 0 2 * * *
    volumes:
      - ./backups:/backups # Map the backups from container
      - /var/run/docker.sock:/var/run/docker.sock # Required

  mysql:
    image: mysql:8.0
    container_name: mysql-app
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: myapp
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - mysql_data:/var/lib/mysql
    labels:
      - docker-backup-tool.backup=true
      - docker-backup-tool.command=mysqldump -u root -prootpassword --all-databases
      - docker-backup-tool.location=/tmp/backup
      - docker-backup-tool.retention=7
      - docker-backup-tool.pre_command=mkdir -p /tmp/backup
      - docker-backup-tool.post_command=rm -rf /tmp/backup/*

volumes:
  mysql_data:
```
