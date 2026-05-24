# Deploy RAPID web dashboard to Vercel (free tier).
#
# Prereqs: npm i -g vercel, vercel login
#
# Usage (from repo root):
#   .\scripts\vercel-deploy.ps1
#   .\scripts\vercel-deploy.ps1 -Production

param(
    [switch]$Production
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WebDir = Join-Path $RepoRoot "web"
$EnvFile = Join-Path $WebDir ".env"

function Invoke-Vercel {
    param([string[]]$VercelArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & vercel @VercelArgs 2>&1
        return @{ ExitCode = $LASTEXITCODE; Output = @($out) }
    }
    finally {
        $ErrorActionPreference = $prev
    }
}

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Missing '$name'. Install with: npm i -g vercel"
    }
}

Require-Command vercel

Write-Host "Checking Vercel auth..." -ForegroundColor Cyan
$who = Invoke-Vercel -VercelArgs @("whoami")
if ($who.ExitCode -ne 0) {
    Write-Host ($who.Output -join " ")
    Write-Host "Not logged in. Run: vercel login" -ForegroundColor Yellow
    exit 1
}
Write-Host ($who.Output -join " ")

if (-not (Test-Path $EnvFile)) {
    throw 'Missing web/.env - copy web/.env.example and fill in VITE_* keys.'
}

Set-Location $WebDir

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    if ($line -match "^([^=]+)=(.*)$") {
        $vars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$required = @("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_API_URL")
foreach ($key in $required) {
    if (-not $vars[$key]) {
        throw "Missing $key in web/.env"
    }
}

$target = if ($Production) { "production" } else { "preview" }
Write-Host "Deploying to Vercel ($target)..." -ForegroundColor Cyan

$deployArgs = @(
    "deploy",
    "--yes",
    "--build-env", "VITE_SUPABASE_URL=$($vars['VITE_SUPABASE_URL'])",
    "--build-env", "VITE_SUPABASE_ANON_KEY=$($vars['VITE_SUPABASE_ANON_KEY'])",
    "--build-env", "VITE_API_URL=$($vars['VITE_API_URL'])"
)
if ($vars["VITE_SITE_URL"]) {
    $deployArgs += @("--build-env", "VITE_SITE_URL=$($vars['VITE_SITE_URL'])")
}
if ($Production) { $deployArgs += "--prod" }

$result = Invoke-Vercel -VercelArgs $deployArgs
Write-Host ($result.Output -join "`n")
if ($result.ExitCode -ne 0) {
    throw "vercel deploy failed (exit $($result.ExitCode))"
}

$outputText = $result.Output -join "`n"
$url = [regex]::Match($outputText, 'https://[^\s]+\.vercel\.app').Value
if ($url) {
    Write-Host ""
    Write-Host "Deployed: $url" -ForegroundColor Green
    if ($Production) {
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Supabase -> Auth -> URL config: add Site URL + redirect URL:"
        Write-Host "     $url"
        Write-Host "  2. Update Railway CORS (from repo root):"
        Write-Host "     .\scripts\railway-deploy.ps1 -CorsOrigin `"$url`" -SkipDeploy -SkipMlUpload"
        Write-Host "     railway redeploy --service rapid-api"
    }
}
