-- ============================================================
-- SKYBIRD — MSSQL (home) SOFT DELETE COLUMNS
-- Run in: SSMS against [skybird]
-- Idempotent: safe to re-run.
--
-- Adds is_deleted / deleted_at / deleted_by to every business
-- table so the bridge can mirror Supabase soft-deletes.
-- ============================================================
USE [skybird];
GO

DECLARE @tables TABLE (name SYSNAME);
INSERT INTO @tables(name) VALUES
 ('tickets'),('ticket_services'),('payments'),('refunds'),
 ('customers'),('suppliers'),('sub_agents');

DECLARE @t SYSNAME;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH(@t,'is_deleted') IS NULL
    EXEC('ALTER TABLE ' + @t + ' ADD is_deleted NVARCHAR(8) NULL DEFAULT ''false''');
  IF COL_LENGTH(@t,'deleted_at') IS NULL
    EXEC('ALTER TABLE ' + @t + ' ADD deleted_at NVARCHAR(64) NULL');
  IF COL_LENGTH(@t,'deleted_by') IS NULL
    EXEC('ALTER TABLE ' + @t + ' ADD deleted_by NVARCHAR(64) NULL');
  FETCH NEXT FROM cur INTO @t;
END
CLOSE cur; DEALLOCATE cur;
GO
-- DONE.
