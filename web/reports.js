'use strict';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const PERIOD_DAYS = Object.freeze({ '7d': 7, '30d': 30, '90d': 90, all: null });
const STATUS_KEYS = ['potential', 'active', 'completed'];
const TYPE_KEYS = ['call', 'email', 'meeting', 'note'];

// The existing timestamp-without-time-zone columns use the database's UTC clock.
// Interpret them as UTC explicitly, then group calendar dates in Vietnam time.
const OVERVIEW_SQL = `
WITH clock AS (
  SELECT COALESCE($2::timestamptz, CURRENT_TIMESTAMP) AS as_of,
         $1::integer AS days
), bounds AS (
  SELECT as_of,
         CASE WHEN days IS NULL THEN NULL ELSE
           (((as_of AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (days - 1))::timestamp
             AT TIME ZONE 'Asia/Ho_Chi_Minh') END AS from_at,
         CASE WHEN days IS NULL THEN 'month' WHEN days = 90 THEN 'week' ELSE 'day' END AS bucket
  FROM clock
), selected_customers AS (
  SELECT c.id, c.created_at AT TIME ZONE 'UTC' AS occurred_at
  FROM customers c CROSS JOIN bounds b
  WHERE (b.from_at IS NULL OR c.created_at AT TIME ZONE 'UTC' >= b.from_at)
    AND (c.created_at AT TIME ZONE 'UTC' <= b.as_of
         OR (b.from_at IS NULL AND c.created_at IS NULL))
), selected_interactions AS (
  SELECT i.id, i.customer_id, i.type, i.content,
         COALESCE(i.interaction_date, i.created_at) AT TIME ZONE 'UTC' AS occurred_at
  FROM interactions i CROSS JOIN bounds b
  WHERE (b.from_at IS NULL OR COALESCE(i.interaction_date, i.created_at) AT TIME ZONE 'UTC' >= b.from_at)
    AND (COALESCE(i.interaction_date, i.created_at) AT TIME ZONE 'UTC' <= b.as_of
         OR (b.from_at IS NULL AND COALESCE(i.interaction_date, i.created_at) IS NULL))
), status_counts AS (
  SELECT CASE WHEN status IN ('potential', 'active', 'completed') THEN status ELSE 'unknown' END AS key,
         COUNT(*)::integer AS count
  FROM customers GROUP BY 1
), type_counts AS (
  SELECT CASE WHEN type IN ('call', 'email', 'meeting', 'note') THEN type ELSE 'other' END AS key,
         COUNT(*)::integer AS count
  FROM selected_interactions GROUP BY 1
), trend_counts AS (
  SELECT date_trunc(b.bucket, c.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
         COUNT(*)::integer AS count
  FROM selected_customers c CROSS JOIN bounds b
  WHERE c.occurred_at IS NOT NULL
  GROUP BY 1
), trend_bounds AS (
  SELECT b.bucket,
         COALESCE(date_trunc(b.bucket, b.from_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                  (SELECT MIN(day) FROM trend_counts)) AS first_day,
         date_trunc(b.bucket, b.as_of AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS last_day
  FROM bounds b
), trend AS (
  SELECT to_char(s.day, 'YYYY-MM-DD') AS date, COALESCE(t.count, 0) AS count
  FROM trend_bounds b
  CROSS JOIN LATERAL generate_series(b.first_day::timestamp, b.last_day::timestamp,
    CASE b.bucket WHEN 'day' THEN INTERVAL '1 day'
                  WHEN 'week' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END) AS s(day)
  LEFT JOIN trend_counts t ON t.day = s.day::date
  ORDER BY s.day
), recent AS (
  SELECT i.id, i.customer_id, c.name AS customer_name, i.type,
         LEFT(i.content, 180) AS summary, i.occurred_at
  FROM selected_interactions i
  LEFT JOIN customers c ON c.id = i.customer_id
  ORDER BY i.occurred_at DESC NULLS LAST, i.id DESC
  LIMIT 6
)
SELECT b.as_of, b.from_at, b.bucket,
       to_char(b.from_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS from_date,
       to_char(b.as_of AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS to_date,
       (SELECT COUNT(*)::integer FROM customers) AS total_customers,
       (SELECT COUNT(*)::integer FROM selected_customers) AS new_customers,
       (SELECT COUNT(*)::integer FROM selected_interactions) AS total_interactions,
       (SELECT COUNT(*)::integer FROM customers WHERE status = 'active') AS active_customers,
       COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM status_counts s), '[]'::jsonb) AS status_counts,
       COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM type_counts t), '[]'::jsonb) AS type_counts,
       COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.date) FROM trend t), '[]'::jsonb) AS trend,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id', r.id, 'customerId', r.customer_id, 'customerName', r.customer_name,
         'type', r.type, 'summary', r.summary, 'occurredAt', r.occurred_at
       ) ORDER BY r.occurred_at DESC NULLS LAST, r.id DESC) FROM recent r), '[]'::jsonb) AS recent
FROM bounds b
`;

function isReportPeriod(period) {
  return typeof period === 'string' && Object.hasOwn(PERIOD_DAYS, period);
}

function distribution(keys, rows, total, extraKey) {
  const counts = new Map(rows.map(row => [row.key, row.count]));
  const visibleKeys = counts.get(extraKey) ? [...keys, extraKey] : keys;
  return visibleKeys.map(key => {
    const count = counts.get(key) || 0;
    return { key, count, percentage: total ? Math.round(count / total * 1000) / 10 : 0 };
  });
}

async function getReportOverview(database, period = '30d', asOf = null) {
  if (!isReportPeriod(period)) throw new RangeError('Khoảng thời gian không hợp lệ');
  // A single statement gives all aggregates the same database snapshot.
  const { rows: [row] } = await database.query(OVERVIEW_SQL, [PERIOD_DAYS[period], asOf]);
  return {
    success: true,
    period,
    timeZone: TIME_ZONE,
    generatedAt: row.as_of.toISOString(),
    range: {
      from: row.from_at ? row.from_at.toISOString() : null,
      to: row.as_of.toISOString(),
      fromDate: row.from_date,
      toDate: row.to_date
    },
    kpis: {
      totalCustomers: row.total_customers,
      newCustomers: row.new_customers,
      totalInteractions: row.total_interactions,
      activeCustomers: row.active_customers
    },
    customerTrend: { granularity: row.bucket, points: row.trend },
    customerStatuses: {
      scope: 'all', total: row.total_customers,
      items: distribution(STATUS_KEYS, row.status_counts, row.total_customers, 'unknown')
    },
    interactionTypes: {
      scope: 'period', total: row.total_interactions,
      items: distribution(TYPE_KEYS, row.type_counts, row.total_interactions, 'other')
    },
    recentInteractions: row.recent
  };
}

module.exports = { OVERVIEW_SQL, isReportPeriod, getReportOverview };
