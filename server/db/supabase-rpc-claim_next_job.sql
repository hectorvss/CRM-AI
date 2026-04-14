CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS SETOF jobs
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs
  SET
    status     = 'running',
    started_at = NOW(),
    attempts   = attempts + 1
  WHERE id = (
    SELECT id
    FROM jobs
    WHERE status = 'pending'
      AND run_at <= NOW()
      AND tenant_id IS NOT NULL
      AND workspace_id IS NOT NULL
    ORDER BY priority ASC, run_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_next_job() TO service_role;
