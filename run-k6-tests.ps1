# =============================================================================
# K6 Load Test Runner Script
# BoardDocs API Performance Testing
# =============================================================================

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("all", "constant", "ramp", "stress", "quick")]
    [string]$Scenario = "constant",
    
    [Parameter(Mandatory=$false)]
    [int]$VUs = 300,
    
    [Parameter(Mandatory=$false)]
    [string]$Duration = "30m",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiCount = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiList = "",
    
    [Parameter(Mandatory=$false)]
    [switch]$Interactive,
    
    [Parameter(Mandatory=$false)]
    [switch]$HttpDebug,
    
    [Parameter(Mandatory=$false)]
    [switch]$Cloud,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputDir = ".\results"
)

$ErrorActionPreference = "Stop"

# Available APIs list - 7 endpoints for dev.boarddocs.com/ind/globallogic/Board.nsf
# Names must match exactly with k6-meeting-load-test.js API_ENDPOINTS
$AvailableApis = @(
    @{ Num=1; Name="goto";                    Priority="High"; Desc="/goto" },
    @{ Num=2; Name="BD-GetPacket";            Priority="High"; Desc="/BD-GetPacket" },
    @{ Num=3; Name="BD-GETMeetingsListForSEO"; Priority="High"; Desc="/BD-GETMeetingsListForSEO" },
    @{ Num=4; Name="BD-GetPolicyBooks";       Priority="High"; Desc="/BD-GetPolicyBooks" },
    @{ Num=5; Name="BD-GetPolicies";          Priority="High"; Desc="/BD-GetPolicies" },
    @{ Num=6; Name="BD-GetPolicyItem";        Priority="High"; Desc="/BD-GetPolicyItem" },
    @{ Num=7; Name="BD-GetPublicFiles";       Priority="High"; Desc="/BD-GetPublicFiles" }
)

# Create output directory if it doesn't exist
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$testScript = ".\k6-meeting-load-test.js"

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "K6 LOAD TEST RUNNER - BoardDocs API" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Check if k6 is installed
try {
    $k6Version = k6 version 2>&1
    Write-Host "K6 Version: $k6Version" -ForegroundColor Green
} catch {
    Write-Host "ERROR: k6 is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Install k6 from: https://k6.io/docs/getting-started/installation/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# =============================================================================
# INTERACTIVE API SELECTION
# =============================================================================

if ($Interactive -or ($ApiCount -eq "" -and $ApiList -eq "")) {
    Write-Host "=" * 80 -ForegroundColor Yellow
    Write-Host "API SELECTION" -ForegroundColor Yellow
    Write-Host "=" * 80 -ForegroundColor Yellow
    Write-Host ""
    
    # Step 1: Ask how many APIs to run together
    Write-Host "How many APIs do you want to run together per iteration?" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] 1 API at a time"
    Write-Host "  [2] 2 APIs together"
    Write-Host "  [3] 3 APIs together"
    Write-Host "  [4] 4 APIs together"
    Write-Host "  [5] 5 APIs together"
    Write-Host "  [6] Custom number (you specify)"
    Write-Host "  [R] Random (1-8 APIs, weighted distribution)"
    Write-Host ""
    
    $countChoice = Read-Host "Enter your choice [1-6 or R]"
    
    switch ($countChoice.ToUpper()) {
        "1" { $ApiCount = "1" }
        "2" { $ApiCount = "2" }
        "3" { $ApiCount = "3" }
        "4" { $ApiCount = "4" }
        "5" { $ApiCount = "5" }
        "6" { 
            $customCount = Read-Host "Enter the number of APIs (1-7)"
            $ApiCount = $customCount
        }
        "R" { $ApiCount = "random" }
        default { 
            Write-Host "Invalid choice. Using random." -ForegroundColor Yellow
            $ApiCount = "random" 
        }
    }
    
    Write-Host ""
    Write-Host "Selected API count: $ApiCount" -ForegroundColor Green
    Write-Host ""
    
    # Step 2: Ask which APIs to run
    Write-Host "=" * 80 -ForegroundColor Yellow
    Write-Host "Which APIs do you want to test?" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [A] ALL APIs (all 7 endpoints)"
    Write-Host "  [S] SELECT specific APIs (choose from list)"
    Write-Host ""
    
    $listChoice = Read-Host "Enter your choice [A/S]"
    
    switch ($listChoice.ToUpper()) {
        "A" { $ApiList = "all" }
        "S" {
            Write-Host ""
            Write-Host "Available APIs:" -ForegroundColor Yellow
            Write-Host ""
            
            foreach ($api in $AvailableApis) {
                $priorityColor = switch ($api.Priority) {
                    "Critical" { "Red" }
                    "High" { "Yellow" }
                    "Medium" { "Gray" }
                    default { "White" }
                }
                Write-Host ("  [{0,2}] {1,-18} [{2,-8}] {3}" -f $api.Num, $api.Name, $api.Priority, $api.Desc) -ForegroundColor $priorityColor
            }
            
            Write-Host ""
            Write-Host "Enter API numbers separated by commas (e.g., 1,4,7,8):" -ForegroundColor Cyan
            $selectedNums = Read-Host "Selection"
            
            $nums = $selectedNums -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' }
            $selectedApiNames = @()
            
            foreach ($num in $nums) {
                $api = $AvailableApis | Where-Object { $_.Num -eq [int]$num }
                if ($api) {
                    $selectedApiNames += $api.Name
                }
            }
            
            if ($selectedApiNames.Count -eq 0) {
                Write-Host "No valid APIs selected. Using all APIs." -ForegroundColor Yellow
                $ApiList = "all"
            } else {
                $ApiList = $selectedApiNames -join ","
            }
        }
        default { 
            Write-Host "Invalid choice. Using all APIs." -ForegroundColor Yellow
            $ApiList = "all" 
        }
    }
    
    Write-Host ""
    Write-Host "Selected APIs: $ApiList" -ForegroundColor Green
    Write-Host ""
}

# Set defaults if not specified
if ($ApiCount -eq "") { $ApiCount = "random" }
if ($ApiList -eq "") { $ApiList = "all" }

# =============================================================================
# BUILD AND RUN K6 COMMAND
# =============================================================================

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "TEST CONFIGURATION" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""
Write-Host "  Scenario:  $Scenario"
Write-Host "  VUs:       $VUs"
Write-Host "  Duration:  $Duration"
Write-Host "  API Count: $ApiCount"
Write-Host "  API List:  $ApiList"
Write-Host "  Output:    $OutputDir"
Write-Host ""

# Build k6 command based on scenario
$k6Args = @()

# Add API configuration
$k6Args += "-e", "API_COUNT=$ApiCount"
$k6Args += "-e", "API_LIST=$ApiList"

switch ($Scenario) {
    "quick" {
        # Quick smoke test
        $k6Args += "--vus", "5"
        $k6Args += "--duration", "30s"
        Write-Host "Running QUICK smoke test (5 VUs, 30s)..." -ForegroundColor Yellow
    }
    "constant" {
        # Only constant load scenario
        $k6Args += "-e", "SCENARIO=constant_load"
        $k6Args += "--vus", $VUs
        $k6Args += "--duration", $Duration
        Write-Host "Running CONSTANT load test ($VUs VUs, $Duration)..." -ForegroundColor Yellow
    }
    "ramp" {
        # Only ramp-up/down scenario (uses stages from script)
        $k6Args += "-e", "SCENARIO=ramp_up_down"
        Write-Host "Running RAMP-UP/DOWN test (predefined stages)..." -ForegroundColor Yellow
    }
    "stress" {
        # Only stress test scenario
        $k6Args += "-e", "SCENARIO=stress_test"
        Write-Host "Running STRESS test (predefined stages)..." -ForegroundColor Yellow
    }
    "all" {
        # Run all scenarios (default behavior from script)
        Write-Host "Running ALL scenarios (constant, ramp, stress)..." -ForegroundColor Yellow
    }
}

# Add common arguments
$k6Args += "--out", "json=$OutputDir\results_$timestamp.json"

if ($HttpDebug) {
    $k6Args += "--http-debug=full"
    Write-Host "HTTP Debug mode enabled" -ForegroundColor Magenta
}

if ($Cloud) {
    $k6Args += "--out", "cloud"
    Write-Host "Cloud output enabled" -ForegroundColor Magenta
}

# Add the test script
$k6Args += "run", $testScript

Write-Host ""
Write-Host "Executing: k6 $($k6Args -join ' ')" -ForegroundColor Gray
Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Run k6
try {
    & k6 $k6Args
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host "Error running k6: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

if ($exitCode -eq 0) {
    Write-Host "TEST COMPLETED SUCCESSFULLY" -ForegroundColor Green
} else {
    Write-Host "TEST COMPLETED WITH THRESHOLD FAILURES (Exit Code: $exitCode)" -ForegroundColor Yellow
}

# List output files
Write-Host ""
Write-Host "Output Files:" -ForegroundColor Yellow
if (Test-Path "$OutputDir\results_$timestamp.json") {
    Write-Host "  - $OutputDir\results_$timestamp.json" -ForegroundColor Gray
}
if (Test-Path ".\summary.json") {
    Move-Item ".\summary.json" "$OutputDir\summary_$timestamp.json" -Force
    Write-Host "  - $OutputDir\summary_$timestamp.json" -ForegroundColor Gray
}
if (Test-Path ".\summary.html") {
    Move-Item ".\summary.html" "$OutputDir\summary_$timestamp.html" -Force
    Write-Host "  - $OutputDir\summary_$timestamp.html" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan

exit $exitCode
