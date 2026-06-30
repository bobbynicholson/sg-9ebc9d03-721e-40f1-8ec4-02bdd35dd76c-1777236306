<#
Close test browsers launched from this repo's .browser-profiles folder.

Examples:
  .\close
  .\close -List
  .\close -Force
#>

[CmdletBinding()]
param(
  [switch]$List,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProfilesRoot = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot ".browser-profiles")).TrimEnd("\")
$ProfilesRootAlt = $ProfilesRoot.Replace("\", "/")

function Get-TestBrowserProcesses {
  $rows = Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and
      $_.CommandLine -and
      ($_.CommandLine.Contains($ProfilesRoot) -or $_.CommandLine.Contains($ProfilesRootAlt))
    } |
    Sort-Object ProcessId

  return @($rows)
}

$matches = @(Get-TestBrowserProcesses)

if ($matches.Count -eq 0) {
  Write-Host "No test browser processes found for $ProfilesRoot"
  exit 0
}

if ($List) {
  Write-Host "Test browser processes:"
  foreach ($row in $matches) {
    $profile = ""
    if ($row.CommandLine -match "--user-data-dir=(`"([^`"]+)`"|([^ ]+))") {
      $profile = if ($Matches[2]) { $Matches[2] } else { $Matches[3] }
      $profile = Split-Path -Leaf $profile.Trim('"')
    }
    Write-Host ("  {0,7}  {1,-10}  {2}" -f $row.ProcessId, $row.Name, $profile)
  }
  exit 0
}

$processIds = @($matches | Select-Object -ExpandProperty ProcessId -Unique)

if (-not $Force) {
  foreach ($pidValue in $processIds) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process -and $process.MainWindowHandle -ne 0) {
      [void]$process.CloseMainWindow()
    }
  }

  Start-Sleep -Seconds 3
}

$remaining = @(Get-TestBrowserProcesses | Select-Object -ExpandProperty ProcessId -Unique)
foreach ($pidValue in $remaining) {
  Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
}

Write-Host "Closed $($processIds.Count) test browser process(es)."
