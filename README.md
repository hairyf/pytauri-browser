# starter-pytauri

一个可直接落地的 Tauri + Python（PyO3）启动模板，用于构建桌面 Agent 应用。

## 在现有项目接入

如果你要把这套能力迁移到已有 Tauri 项目，查看 `docs/install.md`。

Agent 接入：

```
帮我支持 Python 能力：https://raw.githubusercontent.com/hairyf/starter-pytauri/main/docs/install.md
```

## 快速开始

```powershell
cd tauri
uv venv --python-preference only-system
uv pip install -e .
cd ..
pnpm tauri dev
```

## Python 依赖管理

```powershell
cd tauri
uv add <package_name>
uv remove <package_name>
```

## 构建与打包

### 1) 准备可移植 Python

从 `python-build-standalone` 下载对应平台的 `install_only_stripped` 包，并解压到 `tauri/pyembed/python`。

参考发布页：<https://github.com/astral-sh/python-build-standalone/releases>

### 2) 安装项目到嵌入式 Python

```powershell
$env:PYTAURI_STANDALONE="1"

uv pip install `
  --exact `
  --python=".\tauri\pyembed\python\python.exe" `
  --reinstall-package=tauri-app `
  .\tauri
```

其中 `tauri-app` 为你的 Python 包名。

### 3) 添加 Cargo Profile（若未配置）

```toml
[profile.bundle-dev]
inherits = "dev"

[profile.bundle-release]
inherits = "release"
```

### 4) 执行打包

```powershell
pnpm tauri build --config="tauri/tauri.bundle.json" -- --profile bundle-release
```


## Windows 常见问题

### `STATUS_DLL_NOT_FOUND` / 缺少 `python*.dll`

原因通常是系统找不到基座 Python 的 DLL。可用下面脚本把 `.venv/pyvenv.cfg` 里的 `home` 路径自动加入用户 `Path`。
在项目根目录执行（执行后重启终端或 IDE）：

```powershell
# 1. 提取 pyvenv.cfg 中的 home 路径
$cfgPath = ".venv\pyvenv.cfg"
if (!(Test-Path $cfgPath)) { Write-Error "未找到 .venv，请先执行创建环境命令"; return }
$homeDir = (Get-Content $cfgPath | Select-String "^home\s*=\s*(.*)").Matches.Groups[1].Value.Trim()
# 2. 读取当前用户 Path 并检查是否存在该路径
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$normalizedPath = $homeDir.TrimEnd('\')
$pathList = $userPath -split ';' | ForEach-Object { $_.TrimEnd('\') }
if ($pathList -notcontains $normalizedPath) {
    $newPath = "$($userPath.TrimEnd(';'));$homeDir"
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "✅ 已成功将 Python 运行库路径添加到用户 Path: $homeDir" -ForegroundColor Green
    Write-Host "⚠️ 请重启终端或 IDE 以使更改生效。" -ForegroundColor Yellow
} else {
    Write-Host "ℹ️ 路径已存在于环境变量中，无需重复操作。" -ForegroundColor Cyan
}
```
