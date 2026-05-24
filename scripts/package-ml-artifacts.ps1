# Zip server ML weights for ML_ARTIFACTS_URL (Railway Docker build download).
# Output: dist/ml-artifacts.zip (~400 MB)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Artifacts = Join-Path $RepoRoot "ml\artifacts"
$OutDir = Join-Path $RepoRoot "dist"
$OutZip = Join-Path $OutDir "ml-artifacts.zip"

$Required = @(
    "rf_pre.joblib",
    "rf_post.joblib",
    "resnet50_pre.keras",
    "resnet50_post.keras"
)

foreach ($name in $Required) {
    $path = Join-Path $Artifacts $name
    if (-not (Test-Path $path)) {
        throw "Missing $path - download server models into ml/artifacts/ first."
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $OutZip) { Remove-Item $OutZip -Force }

$tempDir = Join-Path $env:TEMP ("rapid-ml-zip-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
try {
    foreach ($name in $Required) {
        Copy-Item (Join-Path $Artifacts $name) (Join-Path $tempDir $name)
    }
    Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $OutZip -CompressionLevel Fastest
}
finally {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

$sizeMb = [math]::Round((Get-Item $OutZip).Length / 1MB, 1)
Write-Host "Created $OutZip ($sizeMb MB)"
