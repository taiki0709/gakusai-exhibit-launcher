# Starts an exhibit's exe, brings its window to the front, and waits until it exits.
# Called by server.js. Prints "PID=<number>" so the server can force-stop it.
#
# Note: some exes (for example PyInstaller --onefile) start a second "child" process
# that owns the real window. So we look for windows in the whole process tree.
param([Parameter(Mandatory = $true)][string]$Exe)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@

# Print a line right away (otherwise output may only appear when the game ends).
function Log([string]$msg) {
  [Console]::Out.WriteLine($msg)
  [Console]::Out.Flush()
}

function Get-TreeIds([int]$rootId) {
  $ids = @($rootId)
  $queue = @($rootId)
  while ($queue.Count -gt 0) {
    $parent = $queue[0]
    $queue = @($queue | Select-Object -Skip 1)
    $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$parent" -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.ProcessId })
    $ids += $kids
    $queue += $kids
  }
  return $ids
}

function Find-Window([int]$rootId) {
  foreach ($id in (Get-TreeIds $rootId)) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { return $proc.MainWindowHandle }
  }
  return [IntPtr]::Zero
}

function Bring-ToFront([IntPtr]$h) {
  # Pressing and releasing ALT lets Windows allow the focus change.
  [Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  # Restore (9) only a minimized window. Restoring a maximized or full-screen game would shrink it.
  if ([Win]::IsIconic($h)) { [Win]::ShowWindow($h, 9) | Out-Null } else { [Win]::ShowWindow($h, 5) | Out-Null }
  [Win]::BringWindowToTop($h) | Out-Null
  [Win]::SetForegroundWindow($h) | Out-Null
}

# -WindowStyle Normal is important: the launcher runs this script hidden, and without it
# the game would inherit "hidden" and run invisibly.
$p = Start-Process -FilePath $Exe -WorkingDirectory (Split-Path -Parent $Exe) -WindowStyle Normal -PassThru
Log ("PID=" + $p.Id)
Log "started"

# Wait up to 30 seconds for a window (onefile exes can take a few seconds to unpack).
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 150; $i++) {
  if ($p.HasExited) { break }
  $h = Find-Window $p.Id
  if ($h -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 200
}

if ($h -ne [IntPtr]::Zero) {
  Log "window found"
  # Try a few times; the window may still be drawing itself.
  for ($k = 0; $k -lt 3; $k++) {
    Bring-ToFront $h
    Start-Sleep -Milliseconds 400
  }
} else {
  Log "no window found"
}

$p.WaitForExit()
Log ("exit code " + $p.ExitCode)
