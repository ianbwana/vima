-- Migration: Add analytics daily rollup table
-- Pre-computed daily metrics per dimension for fast dashboard queries.

CREATE TABLE analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date VARCHAR(10) NOT NULL,
  metric VARCHAR(100) NOT NULL,
  dimension VARCHAR(50) NOT NULL,
  dimension_value VARCHAR(100) NOT NULL,
  value DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_daily_date ON analytics_daily(date);
CREATE INDEX idx_analytics_daily_metric ON analytics_daily(metric, date);
CREATE UNIQUE INDEX idx_analytics_daily_unique ON analytics_daily(date, metric, dimension, dimension_value);
