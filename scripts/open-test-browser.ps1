<#
Open an isolated browser profile for testing with different app/email accounts.

Examples:
  .\go admin
  .\go admin -Login
  .\go staff -Login
  .\go customer https://cateringms.com/c/account
  .\go gmail-one https://accounts.google.com
  .\go -All
  .\go -All -Login
  .\go -List
  .\go -Reset admin
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Profile = "",

  [Parameter(Position = 1)]
  [string]$Url = "",

  [ValidateSet("chrome", "edge")]
  [string]$Browser = "chrome",

  [switch]$All,
  [switch]$List,
  [switch]$Reset,
  [switch]$Login,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProfilesRoot = Join-Path $RepoRoot ".browser-profiles"
$BuiltInProfiles = @(
  "super-admin",
  "company-admin",
  "admin",
  "kitchen-manager",
  "kitchen",
  "driver",
  "shopping",
  "cleaning-manager",
  "cleaning",
  "client"
)

function Write-Usage {
  @'
Usage:
  .\go [profile-name] [url]
  .\go admin
  .\go admin -Login
  .\go staff -Login
  .\go customer https://cateringms.com/c/account
  .\go gmail-one https://accounts.google.com
  .\go -All
  .\go -All -Login
  .\go -List
  .\go -Reset admin

What it does:
  Each profile name gets its own browser data folder in .browser-profiles.
  Log into one app/email account per profile once, then reopen that profile later.
  Add -Login for the built-in CateringMS test users. This uses local magic
  links from .env.local and does not store passwords in the launcher.

Options:
  -Browser chrome|edge   Prefer Chrome or Edge. Default: chrome, with Edge fallback.
  -Login                 Sign in the named built-in test user with a magic link.
  -All                   Open the 10 built-in Spit Braai test profiles.
  -List                  Show saved profiles.
  -Reset <profile-name>  Delete one saved browser profile.
  -Help                  Show this help.
'@ | Write-Host
}

function Get-DefaultUrlForProfile {
  param([string]$Name)

  $base = "https://cateringms.com"
  $slug = "spit-braai-delivery"
  $safeName = if ([string]::IsNullOrWhiteSpace($Name)) { "" } else { (Get-SafeProfileName -Name $Name) }

  $roleUrls = @{
    "super-admin"   = "$base/auth/login"
    "platform"      = "$base/auth/login"
    "company-admin" = "$base/$slug/login"
    "owner"         = "$base/$slug/login"
    "admin"         = "$base/$slug/login"
    "staff"         = "$base/$slug/login"
    "kitchen-manager" = "$base/$slug/login"
    "kitchen"       = "$base/$slug/login"
    "driver"        = "$base/$slug/login"
    "waiter"        = "$base/$slug/login"
    "shopping"      = "$base/$slug/login"
    "cleaning-manager" = "$base/$slug/login"
    "cleaner-manager" = "$base/$slug/login"
    "cleaning"      = "$base/$slug/login"
    "cleaner"       = "$base/$slug/login"
    "client"        = "$base/$slug/client/login"
    "customer"      = "$base/$slug/client/login"
  }

  if ($roleUrls.ContainsKey($safeName)) {
    return $roleUrls[$safeName]
  }

  if ($safeName -match "^(client|customer)") {
    return "$base/$slug/client/login"
  }

  if ($safeName -match "^(admin|company-admin|owner|staff|kitchen|driver|waiter|shopping|cleaning|cleaner)") {
    return "$base/$slug/login"
  }

  return "$base/auth/login"
}

function Get-SafeProfileName {
  param([string]$Name)

  $clean = $Name.Trim() -replace "\s+", "-"

  if ([string]::IsNullOrWhiteSpace($clean)) {
    throw "Profile name is required."
  }

  if ($clean -eq "." -or $clean -eq ".." -or $clean -match '[\\/:*?"<>|]') {
    throw "Use a simple profile name like admin, customer, staff-one, or gmail1."
  }

  return $clean.ToLowerInvariant()
}

function Get-KnownProfiles {
  if (-not (Test-Path -LiteralPath $ProfilesRoot)) {
    return @()
  }

  return @(Get-ChildItem -LiteralPath $ProfilesRoot -Directory | Sort-Object Name)
}

function Get-BrowserCandidates {
  param([ValidateSet("chrome", "edge")][string]$Name)

  if ($Name -eq "chrome") {
    return @(
      (Get-Command chrome.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source,
      (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
      (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
      (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe")
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  }

  return @(
    (Get-Command msedge.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source,
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:LocalAppData "Microsoft\Edge\Application\msedge.exe")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

function Resolve-Browser {
  param([ValidateSet("chrome", "edge")][string]$Preferred)

  $browserOrder = if ($Preferred -eq "edge") { @("edge", "chrome") } else { @("chrome", "edge") }

  foreach ($browserName in $browserOrder) {
    foreach ($candidate in (Get-BrowserCandidates -Name $browserName)) {
      if (Test-Path -LiteralPath $candidate) {
        return [pscustomobject]@{
          Name = $browserName
          Path = (Resolve-Path -LiteralPath $candidate).Path
        }
      }
    }
  }

  throw "Could not find Chrome or Edge. Install one of them, then run .\go again."
}

function Remove-TestProfile {
  param([string]$ProfileName)

  $safeName = Get-SafeProfileName -Name $ProfileName
  $profileDir = Join-Path $ProfilesRoot $safeName

  $rootFull = [System.IO.Path]::GetFullPath($ProfilesRoot).TrimEnd("\") + "\"
  $targetFull = [System.IO.Path]::GetFullPath($profileDir)

  if (-not $targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to reset a path outside .browser-profiles."
  }

  if (-not (Test-Path -LiteralPath $profileDir)) {
    Write-Host "Profile '$safeName' does not exist."
    return
  }

  Remove-Item -LiteralPath $profileDir -Recurse -Force
  Write-Host "Deleted profile '$safeName'."
}

function Open-TestProfile {
  param(
    [string]$ProfileName,
    [string]$TargetUrl,
    [object]$BrowserInfo
  )

  $safeName = Get-SafeProfileName -Name $ProfileName
  $profileDir = Join-Path $ProfilesRoot $safeName

  if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir | Out-Null
  }

  $arguments = @(
    "--user-data-dir=`"$profileDir`"",
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "`"$TargetUrl`""
  )

  Start-Process -FilePath $BrowserInfo.Path -ArgumentList $arguments -WindowStyle Normal
  Write-Host "Opened $($BrowserInfo.Name) profile '$safeName' -> $TargetUrl"
}

if ($Help) {
  Write-Usage
  exit 0
}

if ($Login) {
  $loginScript = Join-Path $PSScriptRoot "open-test-login.mjs"
  $nodeArgs = @()

  if ($All) {
    $nodeArgs += "--all"
  } elseif (-not [string]::IsNullOrWhiteSpace($Profile)) {
    $nodeArgs += $Profile
  }

  $nodeArgs += "--browser"
  $nodeArgs += $Browser

  & node $loginScript @nodeArgs
  exit $LASTEXITCODE
}

if ($All -and $Profile -match "^(https?://|file://)") {
  $Url = $Profile
  $Profile = ""
}

if ($List) {
  $profiles = @(Get-KnownProfiles)

  if ($profiles.Count -eq 0) {
    Write-Host "No saved profiles yet. Create one with: .\go admin"
    exit 0
  }

  Write-Host "Saved profiles:"
  foreach ($knownProfile in $profiles) {
    Write-Host "  $($knownProfile.Name)"
  }
  exit 0
}

if ($Reset) {
  Remove-TestProfile -ProfileName $Profile
  exit 0
}

$browserInfo = Resolve-Browser -Preferred $Browser

if ($All) {
  foreach ($profileName in $BuiltInProfiles) {
    $targetUrl = $Url
    if ([string]::IsNullOrWhiteSpace($targetUrl)) {
      $targetUrl = Get-DefaultUrlForProfile -Name $profileName
    }
    Open-TestProfile -ProfileName $profileName -TargetUrl $targetUrl -BrowserInfo $browserInfo
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Profile)) {
  $Profile = "default"
}

if ([string]::IsNullOrWhiteSpace($Url)) {
  $Url = Get-DefaultUrlForProfile -Name $Profile
}

Open-TestProfile -ProfileName $Profile -TargetUrl $Url -BrowserInfo $browserInfo
