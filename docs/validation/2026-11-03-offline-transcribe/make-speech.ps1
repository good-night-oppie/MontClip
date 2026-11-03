param([string]$Text, [string]$Wav, [string]$Lang = "zh-CN")
# Synthetic speech with Windows' OneCore voices (Windows.Media.SpeechSynthesis; the Chinese voices live here, not in
# System.Speech). Long text is spoken paragraph by paragraph; the WAV pieces are written next to $Wav as $Wav.NNN.wav.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq $Lang } | Select-Object -First 1
if (-not $voice) { Write-Error "no OneCore voice for $Lang"; exit 2 }
$synth.Voice = $voice
Write-Output ("voice " + $voice.DisplayName)
$paras = [IO.File]::ReadAllText($Text, [Text.Encoding]::UTF8) -split "`n" | Where-Object { $_.Trim() }
$i = 0
foreach ($p in $paras) {
  $stream = Await ($synth.SynthesizeTextToStreamAsync($p.Trim())) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $n = [uint32]$stream.Size
  $null = Await ($reader.LoadAsync($n)) ([uint32])
  $bytes = New-Object byte[] $n; $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes(("{0}.{1:D3}.wav" -f $Wav, $i), $bytes); $i++
}
Write-Output ("pieces " + $i)
