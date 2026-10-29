const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const BACKUP_PREFIX = 'online-bookstore-';
const BACKUP_SUFFIX = '.archive.gz';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const BACKUP_NAME_PATTERN = /^online-bookstore-(\d{8}T\d{9}Z)\.archive\.gz$/;

function formatTimestamp(date) {
  return date.toISOString().replace(/[-:.]/g, '');
}

function timestampFromBackupName(name) {
  const match = BACKUP_NAME_PATTERN.exec(name);
  if (!match) return null;

  const value = match[1];
  const timestamp = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    + `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.${value.slice(15, 18)}Z`;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

async function pruneExpiredBackups(directory, now) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const cutoff = now - RETENTION_MS;

  await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const timestamp = timestampFromBackupName(entry.name);
      if (timestamp !== null && timestamp < cutoff) {
        await fs.unlink(path.join(directory, entry.name));
      }
    }));
}

async function dumpDatabase(uri, archivePath) {
  const args = [
      `--uri=${uri}`,
      `--archive=${archivePath}`,
      '--gzip',
  ];

  await new Promise((resolve, reject) => {
    const process = spawn('mongodump', args, { stdio: 'inherit' });
    process.once('error', (error) => {
      const code = error.code === undefined ? 'unknown' : error.code;
      reject(new Error(`mongodump could not start (${code})`));
    });
    process.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`mongodump failed with exit code ${code ?? signal ?? 'unknown'}`));
      }
    });
  });
}

async function createBackup({
  uri = process.env.MONGODB_URI,
  directory = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups'),
  now = new Date(),
  dump = dumpDatabase,
} = {}) {
  if (!uri) throw new Error('MONGODB_URI must be set');

  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const archivePath = path.join(directory, `${BACKUP_PREFIX}${formatTimestamp(now)}${BACKUP_SUFFIX}`);
  const temporaryPath = `${archivePath}.${process.pid}.tmp`;

  try {
    await dump(uri, temporaryPath);
    await fs.rename(temporaryPath, archivePath);
    await pruneExpiredBackups(directory, now.getTime());
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }

  return archivePath;
}

async function runScheduledBackups() {
  const runBackup = async () => {
    try {
      const archive = await createBackup();
      console.info(`Database backup created: ${path.basename(archive)}`);
    } catch (error) {
      console.error(`Database backup failed: ${error.message}`);
    }
  };

  await runBackup();

  const scheduleNext = () => {
    const now = new Date();
    const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const delay = Math.max(1, nextMidnight - now.getTime());
    setTimeout(async () => {
      await runBackup();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

async function main() {
  process.umask(0o077);
  if (process.argv.includes('--schedule')) {
    await runScheduledBackups();
    return;
  }

  const archive = await createBackup();
  console.info(`Database backup created: ${path.basename(archive)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Database backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_NAME_PATTERN,
  RETENTION_MS,
  createBackup,
  formatTimestamp,
  pruneExpiredBackups,
  timestampFromBackupName,
};
