<#
.SYNOPSIS
  Configure Claude Code authentication on this Windows user account.

.DESCRIPTION
  Use Login or SetupToken for Claude Code itself. Use Env only when another
  local tool explicitly reads CLAUDE_AI_OAUTH_* variables.

  Do not paste exposed credentials into this script. Rotate them first, then
  paste fresh values directly into the PowerShell prompts.

.EXAMPLE
  .\scripts\setup-claude-local.ps1 -Mode Login

.EXAMPLE
  .\scripts\setup-claude-local.ps1 -Mode SetupToken

.EXAMPLE
  .\scripts\setup-claude-local.ps1 -Mode Env
#>
[CmdletBinding()]
param(
  [ValidateSet("Login", "SetupToken", "Env", "ClearEnv", "Status")]
  [string]$Mode = "Login"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-ClaudeCli {
  $cmd = Get-Command claude -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Claude Code CLI was not found on PATH. Install it first, then rerun this script."
  }
}

function ConvertFrom-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)][System.Security.SecureString]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

function Read-SecretText {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  $secure = Read-Host -Prompt $Prompt -AsSecureString
  ConvertFrom-SecureStringToPlainText -SecureValue $secure
}

function Set-UserEnvironmentVariable {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][string]$Value
  )

  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  $processValue = if ($null -eq $Value) { "" } else { $Value }
  Set-Item -Path "Env:$Name" -Value $processValue -ErrorAction SilentlyContinue
}

function Clear-UserEnvironmentVariable {
  param([Parameter(Mandatory = $true)][string]$Name)

  [Environment]::SetEnvironmentVariable($Name, $null, "User")
  Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
}

Assert-ClaudeCli

switch ($Mode) {
  "Login" {
    claude auth login
    claude auth status
  }

  "SetupToken" {
    claude setup-token
    claude auth status
  }

  "Status" {
    claude auth status
  }

  "Env" {
    Write-Host "Use only fresh rotated Claude OAuth credentials. Do not reuse credentials pasted into chat." -ForegroundColor Yellow

    $accessToken = Read-SecretText "Fresh OAuth access token"
    $refreshToken = Read-SecretText "Fresh OAuth refresh token"
    if ([string]::IsNullOrWhiteSpace($accessToken) -or [string]::IsNullOrWhiteSpace($refreshToken)) {
      throw "Access token and refresh token are required."
    }

    $expiresAt = Read-Host "expiresAt epoch milliseconds (optional)"
    $subscriptionType = Read-Host "subscription type (default: max)"
    $rateLimitTier = Read-Host "rate limit tier (default: default_claude_max_20x)"

    Set-UserEnvironmentVariable "CLAUDE_AI_OAUTH_ACCESS_TOKEN" $accessToken
    Set-UserEnvironmentVariable "CLAUDE_AI_OAUTH_REFRESH_TOKEN" $refreshToken
    Set-UserEnvironmentVariable "CLAUDE_AI_OAUTH_EXPIRES_AT" $expiresAt
    Set-UserEnvironmentVariable "CLAUDE_AI_OAUTH_SCOPES" "user:file_upload,user:inference,user:mcp_servers,user:profile,user:sessions:claude_code"
    Set-UserEnvironmentVariable "CLAUDE_AI_OAUTH_SUBSCRIPTION_TYPE" ($(if ([string]::IsNullOrWhiteSpace($subscriptionType)) { "max" } else { $subscriptionType }))
    Set-UserEnvironmentVariable "CLAUDE_AI_OAUTH_RATE_LIMIT_TIER" ($(if ([string]::IsNullOrWhiteSpace($rateLimitTier)) { "default_claude_max_20x" } else { $rateLimitTier }))

    Write-Host "Stored CLAUDE_AI_OAUTH_* in the current Windows user's environment." -ForegroundColor Green
    Write-Host "Open a new terminal before using them from another process."
  }

  "ClearEnv" {
    @(
      "CLAUDE_AI_OAUTH_ACCESS_TOKEN",
      "CLAUDE_AI_OAUTH_REFRESH_TOKEN",
      "CLAUDE_AI_OAUTH_EXPIRES_AT",
      "CLAUDE_AI_OAUTH_SCOPES",
      "CLAUDE_AI_OAUTH_SUBSCRIPTION_TYPE",
      "CLAUDE_AI_OAUTH_RATE_LIMIT_TIER"
    ) | ForEach-Object { Clear-UserEnvironmentVariable $_ }

    Write-Host "Cleared CLAUDE_AI_OAUTH_* from the current Windows user's environment." -ForegroundColor Green
  }
}
