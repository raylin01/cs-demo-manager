import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { migrateDatabase } from './migrate-database';
import { getAllMigrations } from './get-all-migrations';
import { resetDatabase } from '../reset-database';
import { getDefaultMaps } from '../maps/default-maps';
import { Game } from 'csdm/common/types/counter-strike';

const state = vi.hoisted(() => {
  const execute = vi.fn();
  const values = vi.fn(() => ({ execute }));
  const transaction = { insertInto: vi.fn(() => ({ values })) };
  return {
    version: 14,
    values,
    transaction,
    begin: vi.fn(async (run: (tx: typeof transaction) => Promise<void>) => run(transaction)),
  };
});

vi.mock('csdm/node/database/database', () => ({
  db: {
    selectFrom: () => ({
      select: () => ({
        orderBy: () => ({ executeTakeFirst: () => Promise.resolve({ schemaVersion: state.version }) }),
      }),
    }),
    transaction: () => ({ execute: state.begin }),
  },
}));
vi.mock('./ensure-migrations-table-exists', () => ({ ensureMigrationsTableExists: vi.fn() }));
vi.mock('../reset-database', () => ({ resetDatabase: vi.fn() }));
vi.mock('./get-all-migrations', () => ({ getAllMigrations: vi.fn() }));

describe('cinematic CLI schema compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('logger', { log: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('accepts an existing schema 14 database without replaying migrations or resetting data', async () => {
    state.version = 14;
    await migrateDatabase();
    expect(getAllMigrations).not.toHaveBeenCalled();
    expect(state.transaction.insertInto).not.toHaveBeenCalled();
    expect(resetDatabase).not.toHaveBeenCalled();
  });

  it.each([12, 13])('upgrades schema %i in order and records schema 14', async (version) => {
    state.version = version;
    const applied: number[] = [];
    vi.mocked(getAllMigrations).mockResolvedValue(
      [12, 13, 14, 15].map((schemaVersion) => ({
        schemaVersion,
        run: () => {
          applied.push(schemaVersion);
          return Promise.resolve();
        },
      })),
    );
    await migrateDatabase();
    expect(applied).toEqual(version === 12 ? [13, 14] : [14]);
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ schema_version: 14 }));
    expect(resetDatabase).not.toHaveBeenCalled();
  });

  it('still refuses a newer schema before starting a write transaction', async () => {
    state.version = 15;
    await expect(migrateDatabase()).rejects.toThrow('Database schema version is 15, app schema version is 14');
    expect(state.begin).not.toHaveBeenCalled();
    expect(resetDatabase).not.toHaveBeenCalled();
  });

  it('registers the real upstream migrations and includes the schema 13 map data', async () => {
    const actual = await vi.importActual<typeof import('./get-all-migrations')>('./get-all-migrations');
    const migrations = await actual.getAllMigrations();
    expect(migrations.slice(-3).map(({ schemaVersion }) => schemaVersion)).toEqual([12, 13, 14]);
    const maps = getDefaultMaps(Game.CS2);
    expect(maps.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['cs_shelter', 'de_boulder', 'de_debris', 'de_eldorado', 'de_fachwerk']),
    );
    expect(maps.find(({ name }) => name === 'de_cache')).toMatchObject({
      position_x: -2000,
      position_y: 3250,
      scale: 5.5,
    });
  });
});
