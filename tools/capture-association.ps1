param(
    [string]$Port,
    [string]$Label = 'zone2',
    [ValidateRange(1,600)][int]$Seconds = 15,
    [string]$RingUrl = 'http://192.168.4.1',
    [string]$BuildCommit = 'unknown',
    [string]$OutputRoot = [Environment]::GetFolderPath('Desktop')
)
$ErrorActionPreference = 'Stop'
if (-not $Port) {
    Write-Host ('Available serial ports: ' + ([IO.Ports.SerialPort]::GetPortNames() -join ', '))
    $Port = Read-Host 'ESP32 COM port (for example COM5)'
}
$safeLabel = $Label -replace '[^a-zA-Z0-9_-]', '_'
$folder = Join-Path $OutputRoot ('artesian_' + $safeLabel + '_' + (Get-Date -Format 'yyyyMMdd_HHmmss_fff'))
New-Item -ItemType Directory -Path $folder | Out-Null
@("LABEL=$Label", "BUILD_COMMIT=$BuildCommit", "PORT=$Port", "START_LOCAL=$((Get-Date).ToString('o'))", "DURATION_SECONDS=$Seconds") | Set-Content (Join-Path $folder 'capture.txt') -Encoding UTF8
function Save-RingSnapshot([string]$Phase) {
    foreach ($endpoint in @('cfg','status','cal/export')) {
        $name = $endpoint.Replace('/','-')
        try {
            Invoke-WebRequest -UseBasicParsing -Uri ($RingUrl.TrimEnd('/') + '/api/' + $endpoint) -TimeoutSec 5 -OutFile (Join-Path $folder "$Phase-$name.json") | Out-Null
        } catch {
            "$Phase $endpoint : $($_.Exception.Message)" | Add-Content (Join-Path $folder 'snapshot-errors.txt')
            Write-Warning "Could not capture $endpoint. Connect to ArtesianRing Wi-Fi; this capture cannot establish the saved geometry without cfg."
        }
    }
}
Read-Host 'Remove the bottle and hands from the sensing area. Press Enter when the scene is empty'
Save-RingSnapshot 'before'
$serial = New-Object IO.Ports.SerialPort $Port,921600,'None',8,'One'
$serial.ReadTimeout = 250
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$log = Join-Path $folder 'serial.txt'
try {
    $serial.Open()
    $serial.DiscardInBuffer()
    Write-Host 'Keep the scene EMPTY. Now briefly press the ESP32 EN/RESET button once (NOT BOOT and not an XM125 button).'
    Write-Host 'Waiting for a fresh startup and successful A, B, C configuration. Do not place the bottle yet.'
    $startupTimer = [Diagnostics.Stopwatch]::StartNew()
    $sawBoot = $false
    $ready = $false
    $configured = @{}
    while ($startupTimer.Elapsed.TotalSeconds -lt 90 -and -not $ready) {
        try {
            $startupLine = $serial.ReadLine().TrimEnd("`r")
            $startupLine | Add-Content (Join-Path $folder 'startup.txt') -Encoding UTF8
            Write-Host $startupLine
            if ($startupLine -match '^\[ring\] Artesian Ring PoC firmware') {
                $sawBoot = $true
                $configured = @{}
            }
            if ($sawBoot -and $startupLine -match '^\[([ABC])\] configure OK') {
                $configured[$Matches[1]] = $true
            }
            if ($sawBoot -and $startupLine -match '^\[[ABC]\] configure FAILED') {
                throw "Sensor setup failed. Leave the target out and share startup.txt from $folder"
            }
            if ($sawBoot -and $configured.Count -eq 3 -and $startupLine -match '^\[ring\] running\.') {
                $ready = $true
            }
        } catch [TimeoutException] { }
    }
    if (-not $ready) {
        throw "No verified complete restart was captured. No target test was recorded. Share startup.txt from $folder"
    }
    Read-Host 'With serial still open, place the bottle at the test position, move your hands away, then press Enter to record'
    $serial.DiscardInBuffer()
    $timer = [Diagnostics.Stopwatch]::StartNew()
    Write-Host "Recording $Label for $Seconds seconds. Saved to $folder"
    while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
        try {
            $line = $serial.ReadLine().TrimEnd("`r")
            $record = ('{0:F3}' -f $timer.Elapsed.TotalSeconds) + "`t" + $line
            $record | Add-Content $log -Encoding UTF8
            Write-Host $record
        } catch [TimeoutException] { }
    }
} finally {
    if ($serial.IsOpen) { $serial.Close() }
    $serial.Dispose()
}
Save-RingSnapshot 'after'
Write-Host "Capture complete: $folder"
