'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db');
const { isReportPeriod, getReportOverview } = require('../reports');

const AS_OF = '2026-10-10T08:00:00.000Z';
let client;

// SELECT-only CTE fixtures shadow the tables for a single statement.
// No real CRM records, schema, sequences or tables are changed by these tests.
const FIXTURES = `
customers(id, name, status, created_at) AS (VALUES
  (1, 'A', 'potential', TIMESTAMP '2026-10-03 16:59:59'),
  (2, 'B', 'active', TIMESTAMP '2026-10-03 17:00:00'),
  (3, 'C', 'completed', TIMESTAMP '2026-10-10 08:00:00'),
  (4, 'Future', 'active', TIMESTAMP '2026-10-10 08:00:01'),
  (5, 'Undated', NULL, NULL),
  (6, 'F', 'potential', TIMESTAMP '2026-09-10 17:00:00'),
  (7, 'G', 'completed', TIMESTAMP '2026-07-12 17:00:00'),
  (8, 'H', 'active', TIMESTAMP '2026-07-12 16:59:59')
),
interactions(id, customer_id, type, content, interaction_date, created_at) AS (VALUES
  (1, 1, 'call', 'Before boundary', TIMESTAMP '2026-10-03 16:59:59', TIMESTAMP '2026-10-03 16:59:59'),
  (2, 2, 'call', 'At boundary', TIMESTAMP '2026-10-03 17:00:00', TIMESTAMP '2026-10-03 17:00:00'),
  (3, 3, 'email', repeat('x', 220), TIMESTAMP '2026-10-10 08:00:00', TIMESTAMP '2026-10-10 08:00:00'),
  (4, 4, 'meeting', 'Future', TIMESTAMP '2026-10-10 08:00:01', TIMESTAMP '2026-10-10 08:00:01'),
  (5, 2, 'note', 'Fallback date', NULL, TIMESTAMP '2026-10-08 02:00:00'),
  (6, 5, 'legacy', 'Undated', NULL, NULL),
  (7, 6, 'meeting', '30 day boundary', TIMESTAMP '2026-09-10 17:00:00', TIMESTAMP '2026-09-10 17:00:00'),
  (8, 7, 'note', '90 day boundary', TIMESTAMP '2026-07-12 17:00:00', TIMESTAMP '2026-07-12 17:00:00'),
  (9, 8, 'call', 'Before 90 days', TIMESTAMP '2026-07-12 16:59:59', TIMESTAMP '2026-07-12 16:59:59')
)`;

const EMPTY_FIXTURES = `
customers AS (SELECT NULL::int id, NULL::text name, NULL::text status, NULL::timestamp created_at WHERE false),
interactions AS (SELECT NULL::int id, NULL::int customer_id, NULL::text type,
  NULL::text content, NULL::timestamp interaction_date, NULL::timestamp created_at WHERE false)`;

function fixtureDatabase(fixtures = FIXTURES) {
  return { query: (sql, values) => client.query(sql.replace(/^\s*WITH\s+/, `WITH ${fixtures}, `), values) };
}

before(async () => {
  client = await pool.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
});

after(async () => {
  if (client) { await client.query('ROLLBACK'); client.release(); }
  await pool.end();
});

test('period allowlist rejects arrays, objects and SQL-like input before querying', async () => {
  for (const period of ['7d', '30d', '90d', 'all']) assert.equal(isReportPeriod(period), true);
  for (const period of ['__proto__', "7d' OR 1=1 --", '', null, ['30d'], {}]) {
    assert.equal(isReportPeriod(period), false);
    await assert.rejects(() => getReportOverview({ query: () => assert.fail('Invalid period queried database') }, period), RangeError);
  }
});

test('7 calendar days use Vietnam midnight and include exact boundaries', async () => {
  const report = await getReportOverview(fixtureDatabase(), '7d', AS_OF);
  assert.equal(report.timeZone, 'Asia/Ho_Chi_Minh');
  assert.equal(report.range.from, '2026-10-03T17:00:00.000Z');
  assert.equal(report.range.fromDate, '2026-10-04');
  assert.equal(report.range.toDate, '2026-10-10');
  assert.deepEqual(report.kpis, { totalCustomers: 8, newCustomers: 2, totalInteractions: 3, activeCustomers: 3 });
});

test('all four periods change scoped counts while global KPIs remain stable', async () => {
  for (const [period, customers, interactions] of [['7d', 2, 3], ['30d', 4, 5], ['90d', 5, 6], ['all', 7, 8]]) {
    const report = await getReportOverview(fixtureDatabase(), period, AS_OF);
    assert.equal(report.kpis.newCustomers, customers, period);
    assert.equal(report.kpis.totalInteractions, interactions, period);
    assert.equal(report.kpis.totalCustomers, 8);
    assert.equal(report.kpis.activeCustomers, 3);
  }
});

test('current statuses include undated customers and derive real percentages', async () => {
  const report = await getReportOverview(fixtureDatabase(), '7d', AS_OF);
  assert.equal(report.customerStatuses.scope, 'all');
  assert.deepEqual(report.customerStatuses.items, [
    { key: 'potential', count: 2, percentage: 25 },
    { key: 'active', count: 3, percentage: 37.5 },
    { key: 'completed', count: 2, percentage: 25 },
    { key: 'unknown', count: 1, percentage: 12.5 }
  ]);
});

test('interaction distribution uses performed date with created_at fallback', async () => {
  const report = await getReportOverview(fixtureDatabase(), '30d', AS_OF);
  assert.deepEqual(report.interactionTypes.items.map(item => [item.key, item.count, item.percentage]), [
    ['call', 2, 40], ['email', 1, 20], ['meeting', 1, 20], ['note', 1, 20]
  ]);
  const all = await getReportOverview(fixtureDatabase(), 'all', AS_OF);
  assert.deepEqual(all.interactionTypes.items.at(-1), { key: 'other', count: 1, percentage: 12.5 });
});

test('trend fills zero days, groups weekly/monthly and excludes undated records', async () => {
  const day = await getReportOverview(fixtureDatabase(), '7d', AS_OF);
  assert.equal(day.customerTrend.points.length, 7);
  assert.deepEqual(day.customerTrend.points[0], { date: '2026-10-04', count: 1 });
  assert.deepEqual(day.customerTrend.points[1], { date: '2026-10-05', count: 0 });
  assert.deepEqual(day.customerTrend.points.at(-1), { date: '2026-10-10', count: 1 });
  const week = await getReportOverview(fixtureDatabase(), '90d', AS_OF);
  assert.equal(week.customerTrend.granularity, 'week');
  assert.equal(week.customerTrend.points.reduce((sum, point) => sum + point.count, 0), 5);
  const month = await getReportOverview(fixtureDatabase(), 'all', AS_OF);
  assert.equal(month.customerTrend.granularity, 'month');
  assert.equal(month.customerTrend.points.length, 4);
  assert.equal(month.customerTrend.points.reduce((sum, point) => sum + point.count, 0), 6);
});

test('recent interactions are joined, sorted, limited and summarized', async () => {
  const report = await getReportOverview(fixtureDatabase(), '7d', AS_OF);
  assert.deepEqual(report.recentInteractions.map(item => item.id), [3, 5, 2]);
  assert.equal(report.recentInteractions[0].customerName, 'C');
  assert.equal(report.recentInteractions[0].summary.length, 180);
  assert.equal(new Date(report.recentInteractions[0].occurredAt).toISOString(), AS_OF);
  const all = await getReportOverview(fixtureDatabase(), 'all', AS_OF);
  assert.equal(all.recentInteractions.length, 6);
});

test('empty database returns zeros and empty charts without NaN for every filter', async () => {
  for (const period of ['7d', '30d', '90d', 'all']) {
    const report = await getReportOverview(fixtureDatabase(EMPTY_FIXTURES), period, AS_OF);
    assert.ok(Object.values(report.kpis).every(value => value === 0));
    assert.ok(report.customerStatuses.items.every(item => item.count === 0 && item.percentage === 0));
    assert.ok(report.interactionTypes.items.every(item => item.count === 0 && item.percentage === 0));
    assert.ok(report.customerTrend.points.every(point => point.count === 0));
    assert.deepEqual(report.recentInteractions, []);
    if (period === 'all') assert.deepEqual(report.customerTrend.points, []);
    assert.ok(!JSON.stringify(report).includes('NaN'));
  }
});

test('real database global counts agree with independent read-only aggregates', async () => {
  const expected = await client.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status='active')::int AS active FROM customers");
  const report = await getReportOverview(client, '30d');
  assert.equal(report.kpis.totalCustomers, expected.rows[0].total);
  assert.equal(report.kpis.activeCustomers, expected.rows[0].active);
  assert.equal(report.customerStatuses.items.reduce((sum, item) => sum + item.count, 0), expected.rows[0].total);
});
