// SQL_SNIPPETS — HogQL recipes shown in the Plantillas sidebar.
// Mirrors PostHog's `frontend/src/scenes/data-warehouse/editor/snippets.ts`
// (renamed in PostHog as `SAMPLE_QUERIES`). Same `name / description / query`
// shape so the UI is a drop-in.
import type { SqlSnippet } from './types';

export const SQL_SNIPPETS: SqlSnippet[] = [
  {
    name: 'Top events',
    description: 'Most frequent events in the last 24 hours.',
    query:
      `SELECT event, count() AS total\n` +
      `FROM events\n` +
      `WHERE timestamp >= now() - INTERVAL 1 DAY\n` +
      `GROUP BY event\n` +
      `ORDER BY total DESC\n` +
      `LIMIT 20`,
  },
  {
    name: 'Daily active users',
    description: 'Distinct users per day for the last 30 days.',
    query:
      `SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS dau\n` +
      `FROM events\n` +
      `WHERE timestamp >= now() - INTERVAL 30 DAY\n` +
      `GROUP BY day\n` +
      `ORDER BY day`,
  },
  {
    name: 'Top pages',
    description: 'Most viewed $pageview URLs in the last 7 days.',
    query:
      `SELECT properties.$current_url AS url, count() AS views\n` +
      `FROM events\n` +
      `WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY\n` +
      `GROUP BY url\n` +
      `ORDER BY views DESC\n` +
      `LIMIT 50`,
  },
  {
    name: 'Recent errors',
    description: 'Last 100 `$exception` events.',
    query:
      `SELECT timestamp, properties.$exception_type AS type, properties.$exception_message AS message, distinct_id\n` +
      `FROM events\n` +
      `WHERE event = '$exception'\n` +
      `ORDER BY timestamp DESC\n` +
      `LIMIT 100`,
  },
  {
    name: 'Funnel: signup → activation',
    description: 'Users that signed up and then performed `activation`.',
    query:
      `SELECT count(DISTINCT person_id) AS users\n` +
      `FROM (\n` +
      `  SELECT person_id\n` +
      `  FROM events\n` +
      `  WHERE event = 'signup'\n` +
      `) signups\n` +
      `JOIN events activated USING person_id\n` +
      `WHERE activated.event = 'activation'\n` +
      `  AND activated.timestamp > signups.timestamp`,
  },
  {
    name: 'Session duration',
    description: 'Average session duration in seconds, last 7 days.',
    query:
      `SELECT avg(duration) AS avg_seconds, count() AS sessions\n` +
      `FROM sessions\n` +
      `WHERE min_timestamp >= now() - INTERVAL 7 DAY`,
  },
  {
    name: 'New persons today',
    description: 'Persons created in the last 24 hours.',
    query:
      `SELECT id, created_at, properties.email AS email\n` +
      `FROM persons\n` +
      `WHERE created_at >= now() - INTERVAL 1 DAY\n` +
      `ORDER BY created_at DESC`,
  },
  {
    name: 'Conversion rate per day',
    description: 'Daily ratio of `purchase` events to `$pageview`.',
    query:
      `SELECT toDate(timestamp) AS day,\n` +
      `       countIf(event = 'purchase') AS purchases,\n` +
      `       countIf(event = '$pageview') AS views,\n` +
      `       round(purchases / nullIf(views, 0) * 100, 2) AS conversion_pct\n` +
      `FROM events\n` +
      `WHERE timestamp >= now() - INTERVAL 14 DAY\n` +
      `GROUP BY day\n` +
      `ORDER BY day`,
  },
];
