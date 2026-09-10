$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\src\pages\admin'
$files = Get-ChildItem -Path $root -Filter *.tsx -Recurse | Where-Object { $_.FullName -notmatch '\\platform\\' }

# Title-suffix normalisations: every variant of the brand suffix
# resolves to "- CateringMS". The full string before the pipe / dash
# is preserved (so "Client Search" stays "Client Search" - sentence
# casing is a separate manual pass for accuracy).
$titleReplacements = @(
    @{ Old = ' | CateringMS Admin</title>'; New = ' - CateringMS</title>' },
    @{ Old = ' - CateringMS Admin</title>'; New = ' - CateringMS</title>' },
    @{ Old = ' | CateringMS</title>';       New = ' - CateringMS</title>' },
    @{ Old = ' | Admin</title>';            New = ' - CateringMS</title>' },
    @{ Old = ' - Admin</title>';            New = ' - CateringMS</title>' },
    @{ Old = ', CateringMS</title>';        New = ' - CateringMS</title>' }
)

# Wrapper normalisations: every wide-page wrapper resolves to
# max-w-full and the persona-standard lg:pl-72 xl:pl-80 offset.
# Page wrappers that are intentionally narrow (max-w-md auth pages,
# print sheets) aren't matched.
$wrapperReplacements = @(
    @{ Old = 'max-w-screen-2xl mx-auto';  New = 'max-w-full' },
    @{ Old = 'max-w-screen-2xl';          New = 'max-w-full' },
    @{ Old = 'lg:ml-64 xl:ml-72';         New = 'lg:pl-72 xl:pl-80' }
)

$totalTitle = 0
$totalWrap = 0
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
    if ($new -ne $orig) {
        [System.IO.File]::WriteAllText($f.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
        $rel = $f.FullName.Substring($f.FullName.IndexOf('src\pages'))
        Write-Host ('  t={0}  w={1}  {2}' -f $tCount, $wCount, $rel)
        $totalTitle += $tCount
        $totalWrap += $wCount
    }
}
Write-Host ""
Write-Host "Files touched. Title-suffix swaps: $totalTitle. Wrapper swaps: $totalWrap."
