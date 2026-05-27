-- MSSQL: Daily report email settings on agency_profile
IF COL_LENGTH('agency_profile', 'report_email') IS NULL
  ALTER TABLE agency_profile ADD report_email NVARCHAR(255) NULL;
GO

IF COL_LENGTH('agency_profile', 'daily_report_enabled') IS NULL
  ALTER TABLE agency_profile ADD daily_report_enabled BIT NOT NULL CONSTRAINT DF_agency_daily_report_enabled DEFAULT(0);
GO

IF COL_LENGTH('agency_profile', 'daily_report_time') IS NULL
  ALTER TABLE agency_profile ADD daily_report_time NVARCHAR(8) NOT NULL CONSTRAINT DF_agency_daily_report_time DEFAULT('23:59');
GO
