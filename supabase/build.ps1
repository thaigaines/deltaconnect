param([switch]$Rebuild)

$ErrorActionPreference = 'Stop'
$migrationFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'migrations') -Filter '*.sql' |
    Sort-Object Name
if ($migrationFiles.Count -ne 2) { throw 'Expected the two reviewed DeltaConnect migrations.' }

$sqlParts = @('-- DeltaConnect: run as the Supabase database administrator.', 'BEGIN;')
if ($Rebuild) {
    $sqlParts += @'
-- REBUILD: deletes all application rows, including approvals and resume metadata.
-- Auth accounts and Storage files remain. Review before running.
DROP TABLE IF EXISTS public.internship_location, public.internship,
  public.resume, private.approved_editor, private.approved_member CASCADE;
DROP FUNCTION IF EXISTS public.my_permissions(),
  public.create_listing(text,text,text,text,date,jsonb,boolean),
  private.is_approved_member(), private.is_approved_editor(), private.stamp_resume() CASCADE;
-- Previous drafts used different policy names. Remove only those known names.
DROP POLICY IF EXISTS "Approved members can upload their resume file" ON storage.objects;
DROP POLICY IF EXISTS "Approved members can inspect their resume file" ON storage.objects;
DROP POLICY IF EXISTS "Approved members can replace their resume file" ON storage.objects;
DROP POLICY IF EXISTS "Approved members can delete their resume file" ON storage.objects;
DROP POLICY IF EXISTS upload_resume_file ON storage.objects;
DROP POLICY IF EXISTS inspect_resume_file ON storage.objects;
DROP POLICY IF EXISTS replace_resume_file ON storage.objects;
DROP POLICY IF EXISTS delete_resume_file ON storage.objects;
'@
}
foreach ($migrationFile in $migrationFiles) {
    $sqlParts += "-- $($migrationFile.Name)"
    $sqlParts += Get-Content -LiteralPath $migrationFile.FullName -Raw
}
$sqlParts += 'COMMIT;'
$sqlParts -join "`n"
