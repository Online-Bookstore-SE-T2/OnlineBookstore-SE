const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createBackup,
  formatTimestamp,
  pruneExpiredBackups,
  timestampFromBackupName,
} = require('../../src/scripts/backupDatabase');

describe('database backup script', () => {
  let directory;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bookstore-backup-'));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  test('creates an atomic gzip archive and prunes only backups older than seven days', async () => {
    const now = new Date('2026-10-29T09:00:00.000Z');
    const expired = `online-bookstore-${formatTimestamp(new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000) - 1))}.archive.gz`;
    const retained = `online-bookstore-${formatTimestamp(new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000) + 1))}.archive.gz`;
    await fs.writeFile(path.join(directory, expired), 'expired');
    await fs.writeFile(path.join(directory, retained), 'retained');
    await fs.writeFile(path.join(directory, 'not-a-backup.archive.gz'), 'unmanaged');

    const dump = jest.fn(async (_uri, temporaryPath) => fs.writeFile(temporaryPath, 'archive'));
    const archivePath = await createBackup({
      uri: 'mongodb://localhost/test',
      directory,
      now,
      dump,
    });

    expect(dump).toHaveBeenCalledWith(
      'mongodb://localhost/test',
      expect.stringMatching(/\.tmp$/),
    );
    await expect(fs.readFile(archivePath, 'utf8')).resolves.toBe('archive');
    await expect(fs.stat(path.join(directory, expired))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readFile(path.join(directory, retained), 'utf8')).resolves.toBe('retained');
    await expect(fs.readFile(path.join(directory, 'not-a-backup.archive.gz'), 'utf8')).resolves.toBe('unmanaged');
  });

  test('does not prune retained backups when a dump fails', async () => {
    const existing = 'online-bookstore-20261021T085959999Z.archive.gz';
    await fs.writeFile(path.join(directory, existing), 'previous');

    await expect(createBackup({
      uri: 'mongodb://localhost/test',
      directory,
      now: new Date('2026-10-29T09:00:00.000Z'),
      dump: jest.fn().mockRejectedValue(new Error('dump failed')),
    })).rejects.toThrow('dump failed');

    await expect(fs.readFile(path.join(directory, existing), 'utf8')).resolves.toBe('previous');
    await expect(fs.readdir(directory)).resolves.toEqual([existing]);
  });

  test('parses only valid backup archive timestamps', () => {
    const timestamp = Date.parse('2026-10-29T09:00:00.000Z');
    expect(timestampFromBackupName(`online-bookstore-${formatTimestamp(new Date(timestamp))}.archive.gz`))
      .toBe(timestamp);
    expect(timestampFromBackupName('unmanaged.archive.gz')).toBeNull();
  });

  test('requires a MongoDB connection string', async () => {
    await expect(createBackup({ uri: '', directory })).rejects.toThrow('MONGODB_URI must be set');
  });

  test('prunes by backup timestamp without touching unrelated files', async () => {
    const now = Date.parse('2026-10-29T09:00:00.000Z');
    const oldBackup = `online-bookstore-${formatTimestamp(new Date(now - 8 * 24 * 60 * 60 * 1000))}.archive.gz`;
    const newBackup = `online-bookstore-${formatTimestamp(new Date(now - 6 * 24 * 60 * 60 * 1000))}.archive.gz`;
    await fs.writeFile(path.join(directory, oldBackup), 'old');
    await fs.writeFile(path.join(directory, newBackup), 'new');
    await fs.writeFile(path.join(directory, 'notes.txt'), 'keep');

    await pruneExpiredBackups(directory, now);

    await expect(fs.readdir(directory)).resolves.toEqual([newBackup, 'notes.txt'].sort());
  });
});
