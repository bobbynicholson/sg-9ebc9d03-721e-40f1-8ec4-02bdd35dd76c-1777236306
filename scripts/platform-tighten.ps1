$ErrorActionPreference = 'Stop'
$em = [char]8212
$en = [char]8211
$root = Join-Path $PSScriptRoot '..\src\pages\admin\platform'
$files = Get-ChildItem -Path $root -Filter *.tsx -Recurse

# Title-suffix normalisations: every variant of the brand suffix
# resolves to "- CateringMS".
$titleReplacements = @(
    @{ Old = ' | CateringMS Platform</title>'; New = ' - CateringMS</title>' },
    @{ Old = ' - CateringMS Platform</title>'; New = ' - CateringMS</title>' },
    @{ Old = ' | CateringMS Admin</title>';    New = ' - CateringMS</title>' },
    @{ Old = ' - CateringMS Admin</title>';    New = ' - CateringMS</title>' },
    @{ Old = ' | CateringMS</title>';          New = ' - CateringMS</title>' },
    @{ Old = ' | Admin</title>';               New = ' - CateringMS</title>' },
    @{ Old = ' - Platform Admin</title>';      New = ' - CateringMS</title>' },
    @{ Old = ' - Admin</title>';               New = ' - CateringMS</title>' },
    @{ Old = ', CateringMS</title>';           New = ' - CateringMS</title>' },
    @{ Old = ' · Skylight</title>';            New = ' - CateringMS</title>' },
    @{ Old = ' · CateringMS Platform</title>'; New = ' - CateringMS</title>' }
)

# Wrapper normalisations.
$wrapperReplacements = @(
    @{ Old = 'max-w-screen-2xl mx-auto';  New = 'max-w-full' },
    @{ Old = 'max-w-screen-2xl';          New = 'max-w-full' },
    @{ Old = 'lg:ml-64 xl:ml-72';         New = 'lg:pl-72 xl:pl-80' }
)

$totalTitle = 0
$totalWrap = 0
$totalDash = 0
foreach ($f in $files) {
    try {
        $orig = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    } catch { continue }
    if (-not $orig) { continue }
    $new = $orig
    $tCount = 0
    foreach ($r in $titleReplacements) {
        $before = $new
        $new = $new.Replace($r.Old, $r.New)
        if ($new -ne $before) { $tCount += 1 }
    }
    $wCount = 0
    foreach ($r in $wrapperReplacements) {
        $before = $new
        $new = $new.Replace($r.Old, $r.New)
        if ($new -ne $before) { $wCount += 1 }
    }
    $dashCount = ($orig.ToCharArray() | Where-Object { $_ -eq $em -or $_ -eq $en }).Count
    if ($dashCount -gt 0) {
        $new = $new.Replace($em, '-').Replace($en, '-')
    }
    if ($new -ne $orig) {
        [System.IO.File]::WriteAllText($f.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
        $rel = $f.FullName.Substring($f.FullName.IndexOf('src\pages'))
        Write-Host ('  t={0}  w={1}  d={2}  {3}' -f $tCount, $wCount, $dashCount, $rel)
        $totalTitle += $tCount
        $totalWrap += $wCount
        $totalDash += $dashCount
    }
}
Write-Host ""
Write-Host "Title suffix swaps: $totalTitle | Wrapper swaps: $totalWrap | Em/en dashes: $totalDash"
