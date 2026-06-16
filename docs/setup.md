# 개발 환경 설치

DevRig의 도구들을 빌드·실행하기 위한 런타임 설치 방법입니다. 플랫폼별 패키지 매니저를 사용하는 방식을 기본으로 안내합니다.

> 프로젝트 개요와 런타임 요약 표는 [루트 README](../README.md)를 참고하세요.

## 목차

- [패키지 매니저 준비](#패키지-매니저-준비)
- [Docker](#docker)
- [Go](#go)
- [Rust](#rust)
- [Python](#python)
- [Node.js](#nodejs)
- [Java (JDK)](#java-jdk)

## 패키지 매니저 준비

- **Windows**: `winget`이 Windows 10/11에 기본 내장되어 있습니다. 없다면 Microsoft Store의 "App Installer"를 설치하세요.
- **macOS**: [Homebrew](https://brew.sh)를 권장합니다.
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
- **Linux**: 예시는 Debian/Ubuntu(`apt`) 기준입니다. Fedora/RHEL은 `dnf`, Arch는 `pacman`으로 대체하세요.

## Docker

컨테이너 런타임. Windows는 WSL2가 선행 설치되어 있어야 합니다(`wsl --install`).

**Windows**
```powershell
winget install Docker.DockerDesktop
```

**macOS**
```bash
brew install --cask docker   # Docker Desktop (GUI 포함)
```

**Linux**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 재로그인 후 sudo 없이 사용
```

검증: `docker --version`

## Go

**Windows**
```powershell
winget install GoLang.Go
```

**macOS**
```bash
brew install go
```

**Linux** (최신 버전은 [go.dev/dl](https://go.dev/dl)에서 버전 확인)
```bash
# 빠른 설치(배포판 버전, 다소 구버전일 수 있음)
sudo apt-get install -y golang-go

# 또는 최신 버전 직접 설치
curl -LO https://go.dev/dl/go1.22.0.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile && source ~/.profile
```

검증: `go version`

## Rust

모든 플랫폼에서 공식 설치 도구 `rustup`을 권장합니다. Windows는 Visual Studio C++ Build Tools가 필요합니다.

**Windows**
```powershell
winget install Rustlang.Rustup
```

**macOS / Linux**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

검증: `rustc --version` / `cargo --version`

## Python

**Windows**
```powershell
winget install Python.Python.3.12
```

**macOS**
```bash
brew install python
```

**Linux**
```bash
sudo apt-get install -y python3 python3-pip python3-venv
```

검증: `python3 --version` / `pip3 --version`

## Node.js

**버전 매니저(nvm) 사용을 권장합니다.** Homebrew로 설치하면 전역 패키지 설치 시 권한(`EACCES`) 문제가 생기고 버전 전환이 번거롭습니다. nvm은 사용자 홈 디렉토리에 설치되어 권한 문제가 없고, 프로젝트별 Node 버전 전환도 쉽습니다.

**macOS / Linux** ([nvm](https://github.com/nvm-sh/nvm) — install 스크립트의 최신 버전 태그는 저장소에서 확인)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 터미널 재시작 또는: source ~/.nvm/nvm.sh
nvm install --lts          # 최신 LTS 설치
nvm use --lts
nvm alias default 'lts/*'   # 기본 버전 고정
```

**Windows** ([nvm-windows](https://github.com/coreybutler/nvm-windows) — 별도 프로젝트)
```powershell
winget install CoreyButler.NVMforWindows
# 새 터미널에서
nvm install lts
nvm use lts
```

**대안: 버전 관리가 필요 없을 때**
```bash
# macOS
brew install node
# Windows
winget install OpenJS.NodeJS.LTS
# Linux (NodeSource LTS 저장소)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
```

검증: `node --version` / `npm --version`

## Java (JDK)

LTS 배포판으로 **Eclipse Temurin(Adoptium)** 을 권장합니다.

> **오픈소스 & 상용 사용**
> 여기서 안내하는 모든 옵션(Temurin, `openjdk`, SDKMAN의 `-tem`)은 **OpenJDK 기반 오픈소스**이며 라이선스는 **GPLv2 + Classpath Exception** 입니다. Classpath Exception 덕분에 여러분의 코드가 GPL에 전염되지 않으므로 **상용·프로덕션 서비스에 라이선스 비용 없이 자유롭게 사용**할 수 있습니다.
> ⚠️ **Oracle JDK는 별도 라이선스(NFTC 등)** 가 적용되어 버전·기간에 따라 유료 전환·제약이 생길 수 있으니, 라이선스가 자유로운 Temurin/OpenJDK 계열을 사용하세요.

**Windows**
```powershell
winget install EclipseAdoptium.Temurin.21.JDK
```

**macOS**
```bash
brew install --cask temurin   # 또는: brew install openjdk@21
```

**Linux**
```bash
sudo apt-get install -y openjdk-21-jdk

# 또는 SDKMAN으로 여러 버전 관리 (Temurin 명시 설치 권장)
curl -s "https://get.sdkman.io" | bash && source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk list java                 # -tem(Temurin) 식별자 확인 후
sdk install java 21.0.5-tem
```

검증: `java -version` / `javac -version`
