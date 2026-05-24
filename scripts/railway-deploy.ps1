# Deploy RAPID FastAPI to Railway (free trial).
#
# Railway CLI upload limit is ~40 MB. Do NOT use --no-gitignore on the full monorepo.
# This script uploads a minimal staging folder (~2 MB) and downloads ML models
# during the Docker build via ML_ARTIFACTS_URL (Supabase Storage).
#
# Usage (from repo root):
#   .\scripts\railway-deploy.ps1
#   .\scripts\railway-deploy.ps1 -CorsOrigin "https://your-app.vercel.app"
#   .\scripts\railway-deploy.ps1 -SkipDeploy          # env vars only
#   .\scripts\railway-deploy.ps1 -MlArtifactsUrl "https://..."

param(
    [string]$CorsOrigin = "",
    [string]$ServiceName = "rapid-api",
    [string]$MlArtifactsUrl = "",
    [string]$GitHubToken = "",
    [switch]$SkipDeploy,
    [switch]$SkipMlUpload
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Missing '$name'. Install with: npm i -g @railway/cli"
    }
}

function Ensure-RailwayService {
    param([string]$Name)

    $raw = railway service list --json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to list Railway services: $raw"
    }

    $services = @()
    if ($raw) {
        $parsed = $raw | ConvertFrom-Json
        if ($null -ne $parsed) {
            $services = @($parsed)
        }
    }

    if ($services.Count -eq 0) {
        Write-Host "No Railway service yet - creating '$Name'..." -ForegroundColor Cyan
        railway add --service $Name | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "railway add --service $Name failed"
        }
    }

    railway service link $Name | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "railway service link $Name failed"
    }
}

function Build-RailwayStaging {
    param([string]$Root)

    $staging = Join-Path $Root ".railway-staging"
    if (Test-Path $staging) {
        Remove-Item $staging -Recurse -Force
    }

    $backendDest = Join-Path $staging "backend"
    $mlArtifactsDest = Join-Path $staging "ml\artifacts"
    New-Item -ItemType Directory -Force -Path $backendDest | Out-Null
    New-Item -ItemType Directory -Force -Path $mlArtifactsDest | Out-Null

    Get-ChildItem (Join-Path $Root "backend") -Recurse -File | Where-Object {
        $_.FullName -notmatch '\\\.venv\\' -and
        $_.FullName -notmatch '\\\.venv-test\\' -and
        $_.FullName -notmatch '\\venv\\'
    } | ForEach-Object {
        $rel = $_.FullName.Substring((Join-Path $Root "backend").Length + 1)
        $dest = Join-Path $backendDest $rel
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        }
        Copy-Item $_.FullName $dest -Force
    }

    Get-ChildItem (Join-Path $Root "ml\artifacts\*.json") -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.FullName $mlArtifactsDest -Force
    }

    Copy-Item (Join-Path $Root "railway.toml") $staging -Force

    $sizeBytes = (Get-ChildItem $staging -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $sizeMb = [math]::Round($sizeBytes / 1MB, 2)
    Write-Host "Staging folder: $staging ($sizeMb MB)" -ForegroundColor Cyan
    if ($sizeMb -gt 35) {
        throw "Staging upload is ${sizeMb} MB (Railway CLI limit ~40 MB). Check .railway-staging contents."
    }

    return $staging
}

Require-Command railway

Write-Host "Checking Railway auth..." -ForegroundColor Cyan
$whoami = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in. Run: railway login" -ForegroundColor Yellow
    exit 1
}
Write-Host $whoami

$EnvFile = Join-Path $RepoRoot "backend\.env"
if (-not (Test-Path $EnvFile)) {
    throw 'Missing backend/.env - copy backend/.env.example and fill in Supabase + DATABASE_URL.'
}

$RequiredModels = @(
    "ml\artifacts\rf_pre.joblib",
    "ml\artifacts\rf_post.joblib",
    "ml\artifacts\resnet50_pre.keras",
    "ml\artifacts\resnet50_post.keras"
)
$HasLocalModels = ($RequiredModels | Where-Object { -not (Test-Path (Join-Path $RepoRoot $_)) }).Count -eq 0

Write-Host "Linking Railway project..." -ForegroundColor Cyan
railway status 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Using linked Railway project." -ForegroundColor Cyan
}
elseif (-not (Test-Path (Join-Path $RepoRoot ".railway"))) {
    railway init --name rapid-api
    if ($LASTEXITCODE -ne 0) { throw "railway init failed" }
}
else {
    throw "Railway project not linked. Run: railway link"
}

Ensure-RailwayService -Name $ServiceName

if (-not $MlArtifactsUrl -and -not $SkipMlUpload -and $HasLocalModels) {
    Write-Host "Packaging ML models..." -ForegroundColor Cyan
    & (Join-Path $RepoRoot "scripts\package-ml-artifacts.ps1")

    Write-Host "Trying Supabase Storage upload (skipped if zip exceeds free-tier size limit)..." -ForegroundColor Cyan
    $uploadOut = python (Join-Path $RepoRoot "scripts\upload-ml-artifacts-supabase.py") 2>&1
    $uploadExit = $LASTEXITCODE
    $uploadUrl = ($uploadOut | Where-Object { $_ -match '^https?://' } | Select-Object -Last 1)

    if ($uploadExit -eq 0 -and $uploadUrl) {
        $MlArtifactsUrl = $uploadUrl.Trim()
        Write-Host "ML_ARTIFACTS_URL=$MlArtifactsUrl" -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "Upload models via GitHub Releases, then re-run with -MlArtifactsUrl:" -ForegroundColor Yellow
        Write-Host '  .\scripts\railway-deploy.ps1 -MlArtifactsUrl "https://github.com/RAPID-Thesis/rapid-mobile-web/releases/download/TAG/ml-artifacts.zip"'
        Write-Host ""
        Write-Host "Zip ready at: dist\ml-artifacts.zip" -ForegroundColor Cyan
        if (-not $SkipDeploy) {
            throw "ML_ARTIFACTS_URL required before deploy. Create a GitHub Release asset or pass -MlArtifactsUrl."
        }
    }
}
elseif (-not $MlArtifactsUrl -and -not $HasLocalModels) {
    Write-Host ""
    Write-Host "WARNING: No local ML models and no -MlArtifactsUrl. Docker build will warn;" -ForegroundColor Yellow
    Write-Host "set ML_ARTIFACTS_URL on Railway to a zip with rf_*.joblib and resnet50_*.keras."
    Write-Host ""
}

Write-Host "Setting Railway variables from backend/.env..." -ForegroundColor Cyan
$CorsDefaults = @(
    "http://localhost:5173",
    "http://localhost:8081",
    "http://localhost:19006"
)
if ($CorsOrigin) {
    $CorsDefaults += $CorsOrigin.TrimEnd("/")
}
$CorsValue = ($CorsDefaults | Select-Object -Unique) -join ","

Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    if ($line -notmatch "^([^=]+)=(.*)$") { return }
    $key = $Matches[1].Trim()
    $val = $Matches[2].Trim()
    if ($key -eq "CORS_ALLOWED_ORIGINS") { return }
    railway variable set "${key}=${val}" --service $ServiceName --skip-deploys | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to set Railway variable: $key" }
}

railway variable set "CORS_ALLOWED_ORIGINS=$CorsValue" --service $ServiceName --skip-deploys | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to set CORS_ALLOWED_ORIGINS" }

if ($MlArtifactsUrl) {
    railway variable set "ML_ARTIFACTS_URL=$MlArtifactsUrl" --service $ServiceName --skip-deploys | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to set ML_ARTIFACTS_URL" }
}

if ($GitHubToken) {
    railway variable set "GITHUB_TOKEN=$GitHubToken" --service $ServiceName --skip-deploys | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to set GITHUB_TOKEN" }
}
elseif ($MlArtifactsUrl -match 'github\.com') {
    Write-Host ""
    Write-Host "NOTE: Private GitHub release assets need GITHUB_TOKEN on Railway (read-only PAT)." -ForegroundColor Yellow
    Write-Host '  railway variable set GITHUB_TOKEN=ghp_xxxx --service rapid-api'
    Write-Host ""
}

Write-Host "CORS_ALLOWED_ORIGINS=$CorsValue"

if ($SkipDeploy) {
    Write-Host "SkipDeploy - variables updated, no upload." -ForegroundColor Green
    exit 0
}

$staging = Build-RailwayStaging -Root $RepoRoot

Write-Host "Uploading staging folder to Railway (small upload, models fetch at Docker build)..." -ForegroundColor Cyan
& railway up $staging --path-as-root --detach --service $ServiceName
if ($LASTEXITCODE -ne 0) {
    throw "railway up failed"
}

Write-Host ""
Write-Host "Deploy started. Next steps:" -ForegroundColor Green
Write-Host '  1. railway domain --service rapid-api'
Write-Host '  2. railway logs --service rapid-api'
Write-Host '  3. curl https://YOUR-URL/api/health  (expect ml_artifacts_ready: true)'
Write-Host ""
Write-Host "Update mobile/.env EXPO_PUBLIC_API_URL with the Railway URL, then rebuild the APK."
