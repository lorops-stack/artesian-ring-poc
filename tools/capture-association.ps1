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
Save-RingSnapshot 'before'
$serial = New-Object IO.Ports.SerialPort $Port,921600,'None',8,'One'
$serial.ReadTimeout = 250
$serial.DtrEnable = $false
$serial.RtsEnable = $false
$log = Join-Path $folder 'serial.txt'
try {
    $serial.Open()
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
