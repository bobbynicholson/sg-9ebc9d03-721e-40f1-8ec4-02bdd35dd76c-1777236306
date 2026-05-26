$ErrorActionPreference = 'Stop'
$em = [char]8212
$en = [char]8211
$root = Join-Path $PSScriptRoot '..\src\pages\admin'
$files = Get-ChildItem -Path $root -Filter *.tsx -Recurse | Where-Object { $_.FullName -notmatch '\\platform\\' }
$total = 0
foreach ($f in $files) {
    try {
        $orig = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    } catch {
        Write-Host "  SKIP (read failed): $($f.FullName)"
        continue
    }
    if (-not $orig) { continue }
    $new = $orig.Replace($em, '-').Replace($en, '-')
    if ($new -ne $orig) {
        $count = ($orig.ToCharArray() | Where-Object { $_ -eq $em -or $_ -eq $en }).Count
        [System.IO.File]::WriteAllText($f.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
        $rel = $f.FullName.Substring($f.FullName.IndexOf('src\pages'))
        Write-Host ('  {0,3}  {1}' -f $count, $rel)
        $total += $count
    }
}
Write-Host ""
Write-Host "Total replacements: $total"
