# =====================================================
# Zuri POS - Auto-Update Publisher
# Usage: .\release.ps1           (patch: 1.0.0 -> 1.0.1)
#        .\release.ps1 minor     (minor: 1.0.0 -> 1.1.0)
#        .\release.ps1 major     (major: 1.0.0 -> 2.0.0)
# =====================================================
param(
    [string]$bump = "patch"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Zuri POS Auto-Update Publisher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check GH_TOKEN
if (-not $env:GH_TOKEN) {
    Write-Host "ERROR: GH_TOKEN not set." -ForegroundColor Red
    Write-Host ""
    Write-Host "To get a token:" -ForegroundColor Yellow
    Write-Host "  1. Go to https://github.com/settings/tokens/new" -ForegroundColor White
    Write-Host "  2. Select scopes: [repo]" -ForegroundColor White
    Write-Host "  3. Copy the token and run:" -ForegroundColor White
    Write-Host '     $env:GH_TOKEN = "ghp_YOUR_TOKEN_HERE"' -ForegroundColor Green
    Write-Host "  4. Then run .\release.ps1 again" -ForegroundColor White
    Write-Host ""
    exit 1
}

# 2. Check publish config is set
$pkg = Get-Content "package.json" | ConvertFrom-Json
$owner = $pkg.build.publish[0].owner
$repo  = $pkg.build.publish[0].repo

if ($owner -eq "FILL_IN_GITHUB_USERNAME" -or $repo -eq "FILL_IN_REPO_NAME") {
    Write-Host "ERROR: GitHub publish config not set in package.json" -ForegroundColor Red
    Write-Host ""
    Write-Host "Open package.json and update the 'publish' section:" -ForegroundColor Yellow
    Write-Host '  "publish": [{ "provider": "github", "owner": "YOUR_USERNAME", "repo": "YOUR_REPO" }]' -ForegroundColor Green
    Write-Host ""
    exit 1
}

# 3. Bump version
$oldVersion = $pkg.version
Write-Host "Current version: v$oldVersion" -ForegroundColor Gray
Write-Host "Bumping: $bump" -ForegroundColor Yellow

npm version $bump --no-git-tag-version | Out-Null

$newPkg = Get-Content "package.json" | ConvertFrom-Json
$newVersion = $newPkg.version
Write-Host "New version:     v$newVersion" -ForegroundColor Green
Write-Host ""

# 4. Build and publish
Write-Host "Building and publishing to GitHub Releases..." -ForegroundColor Cyan
Write-Host "(This will take a few minutes)" -ForegroundColor Gray
Write-Host ""

npm run release

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build/publish failed." -ForegroundColor Red
    # Revert version bump
    npm version $oldVersion --no-git-tag-version | Out-Null
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SUCCESS: v$newVersion published!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "All installed apps will automatically receive this" -ForegroundColor White
Write-Host "update within 4 hours - no reinstall needed." -ForegroundColor White
Write-Host ""
Write-Host ("GitHub Release: https://github.com/" + $owner + "/" + $repo + "/releases") -ForegroundColor Cyan
Write-Host ""
