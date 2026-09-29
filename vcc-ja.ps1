<#
.SYNOPSIS
    VRChat Creator Companion日本語化パッチ（非公式）のインストール・アンインストール

.DESCRIPTION
    VCCのWebApp\Dist\index.htmlに、翻訳スクリプトと辞書を埋め込みます。
    VCC本体のJSバンドルやプログラムには手を加えません。
    VCCをアップデートするとindex.htmlが置き換わってパッチが外れるので、そのときは再度インストールしてください。

.PARAMETER Action
    install（既定）、uninstall、statusのいずれか。

.PARAMETER VccPath
    VCCのインストール先。省略するとレジストリと既定の場所から探します。

.PARAMETER OutFile
    指定するとVCCには書き込まず、パッチ済みのindex.htmlをこのパスへ出力します（動作確認用）。

.PARAMETER SourceIndex
    パッチを当てる元のindex.html（動作確認用）。省略するとVCCのindex.htmlを使います。

.NOTES
    Copyright (c) 2026 223n <223n@223n.tech>
    MITライセンスです。詳しくはLICENSEとNOTICEを参照してください。
#>
[CmdletBinding()]
param(
    [ValidateSet('install', 'uninstall', 'status')]
    [string]$Action = 'install',
    [string]$VccPath,
    [string]$OutFile,
    [string]$SourceIndex
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$BeginMarker = '<!-- vcc-ja:begin -->'
$EndMarker = '<!-- vcc-ja:end -->'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$InnoSetupKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{A20FE4C3-FE52-495B-B0DA-92992240BFC0}_is1'

function Find-Vcc {
    $path = $VccPath
    if (-not $path) {
        $entry = Get-ItemProperty -Path $InnoSetupKey -ErrorAction SilentlyContinue
        if ($entry -and $entry.PSObject.Properties['InstallLocation'] -and $entry.InstallLocation) {
            $path = $entry.InstallLocation
        } else {
            $path = Join-Path $env:LOCALAPPDATA 'Programs\VRChat Creator Companion'
        }
    }
    $index = Join-Path $path 'WebApp\Dist\index.html'
    if (-not (Test-Path -LiteralPath $index)) {
        throw "VCCが見つかりません: $index`n-VccPathでインストール先を指定してください。"
    }
    [pscustomobject]@{
        Path   = $path.TrimEnd('\')
        Index  = $index
        Backup = "$index.vcc-ja.bak"
    }
}

function Read-Text([string]$path) {
    [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
}

function Write-Text([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text, $Utf8NoBom)
}

function Get-VccVersion($vcc) {
    $buildInfo = Join-Path $vcc.Path 'WebApp\Dist\buildInfo.json'
    if (-not (Test-Path -LiteralPath $buildInfo)) { return '不明' }
    $match = [regex]::Match((Read-Text $buildInfo), '"Major":(\d+),"Minor":(\d+),"Patch":(\d+)')
    if (-not $match.Success) { return '不明' }
    '{0}.{1}.{2}' -f $match.Groups[1].Value, $match.Groups[2].Value, $match.Groups[3].Value
}

# 埋め込んだブロックを取り除いたindex.htmlを返す（未適用ならそのまま）
function Remove-Patch([string]$html) {
    $start = $html.IndexOf($BeginMarker)
    if ($start -lt 0) { return $html }
    $end = $html.IndexOf($EndMarker, $start)
    if ($end -lt 0) {
        throw 'index.htmlのパッチ部分が壊れています（終了マーカーがありません）。VCCを再インストールしてください。'
    }
    $end += $EndMarker.Length
    if ($end -lt $html.Length -and $html[$end] -eq "`r") { $end++ }
    if ($end -lt $html.Length -and $html[$end] -eq "`n") { $end++ }
    $html.Remove($start, $end - $start)
}

function Test-JsonText([string]$json, [string]$path) {
    try {
        if ($PSVersionTable.PSVersion.Major -ge 6) {
            [System.Text.Json.JsonDocument]::Parse($json).Dispose()
        } else {
            Add-Type -AssemblyName System.Web.Extensions
            $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
            $serializer.MaxJsonLength = [int]::MaxValue
            [void]$serializer.DeserializeObject($json)
        }
    } catch {
        throw "辞書ファイルのJSONが正しくありません: $path`n$($_.Exception.Message)"
    }
}

# 文字コードの扱いに左右されないよう、ASCII以外は\uXXXXにしてから埋め込む
function ConvertTo-AsciiScript([string]$text) {
    $builder = New-Object System.Text.StringBuilder ($text.Length * 2)
    foreach ($ch in $text.ToCharArray()) {
        if ([int]$ch -gt 0x7E) {
            [void]$builder.Append('\u').Append(([int]$ch).ToString('x4'))
        } else {
            [void]$builder.Append($ch)
        }
    }
    $builder.ToString()
}

function New-Injection {
    $dictPath = Join-Path $PSScriptRoot 'locales\ja.json'
    $dict = (Read-Text $dictPath).Trim()
    Test-JsonText $dict $dictPath
    $script = ConvertTo-AsciiScript ("window.__VCCJA_DICT__ = $dict;`n" + (Read-Text (Join-Path $PSScriptRoot 'src\translator.js')))
    $style = ConvertTo-AsciiScript (Read-Text (Join-Path $PSScriptRoot 'src\style.css'))
    $script = $script.Replace('</', '<\/')
    # VCCはサーバー側で{{API_URL}}を置換するので、同じ記法を含めない
    foreach ($part in $script, $style) {
        if ($part.Contains('{{') -or $part.Contains('<!--') -or $part.Contains('</')) {
            throw '埋め込む内容に"{{"、"<!--"、"</"のいずれかが含まれています。辞書、translator.js、style.cssを確認してください。'
        }
    }
    "$BeginMarker`n<style>`n$style</style>`n<script>`n$script</script>`n$EndMarker`n"
}

function Install-Patch($vcc) {
    $source = if ($SourceIndex) { $SourceIndex } else { $vcc.Index }
    $original = Remove-Patch (Read-Text $source)
    $anchor = $original.IndexOf('<script type="module"')
    if ($anchor -lt 0) { $anchor = $original.IndexOf('</head>') }
    if ($anchor -lt 0) {
        throw 'index.htmlに挿入位置が見つかりません。VCCの構成が変わった可能性があります。'
    }
    # 翻訳スクリプトはVCC本体より先に読み込ませる
    $lineStart = $original.LastIndexOf("`n", $anchor) + 1
    $patched = $original.Insert($lineStart, (New-Injection))

    if ($OutFile) {
        $OutFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile)
        Write-Text $OutFile $patched
        Write-Host "パッチ済みのindex.htmlを出力しました（VCCには書き込んでいません）: $OutFile"
        return
    }

    Write-Text $vcc.Backup $original
    Write-Text $vcc.Index $patched
    if (-not (Read-Text $vcc.Index).Contains($BeginMarker)) {
        throw 'index.htmlへの書き込みを確認できませんでした。'
    }
    Write-Host "日本語化パッチをインストールしました（VCC $(Get-VccVersion $vcc)）。"
    Write-Host "元のindex.htmlは$($vcc.Backup)に保存しています。"
    Show-RestartNotice
}

function Uninstall-Patch($vcc) {
    $html = Read-Text $vcc.Index
    if ($html.Contains($BeginMarker)) {
        Write-Text $vcc.Index (Remove-Patch $html)
        Write-Host '日本語化パッチをアンインストールしました。'
        Show-RestartNotice
    } else {
        Write-Host '日本語化パッチは適用されていません。'
    }
    if (Test-Path -LiteralPath $vcc.Backup) { Remove-Item -LiteralPath $vcc.Backup }
}

function Show-Status($vcc) {
    $patched = (Read-Text $vcc.Index).Contains($BeginMarker)
    $running = [bool](Get-Process -Name CreatorCompanion -ErrorAction SilentlyContinue)
    Write-Host "VCCの場所      : $($vcc.Path)"
    Write-Host "VCCのバージョン: $(Get-VccVersion $vcc)"
    Write-Host "パッチ         : $(if ($patched) { '適用済み' } else { '未適用' })"
    Write-Host "VCCの起動状態  : $(if ($running) { '起動中' } else { '停止中' })"
}

function Show-RestartNotice {
    if (Get-Process -Name CreatorCompanion -ErrorAction SilentlyContinue) {
        Write-Host 'VCCが起動中です。変更はVCCを再起動したあとに反映されます。' -ForegroundColor Yellow
    }
}

if ($OutFile -and $Action -ne 'install') { throw '-OutFileはinstallでのみ使えます。' }
if ($OutFile -and $SourceIndex) {
    $vcc = $null
} else {
    $vcc = Find-Vcc
}
switch ($Action) {
    'install' { Install-Patch $vcc }
    'uninstall' { Uninstall-Patch $vcc }
    'status' { Show-Status $vcc }
}
