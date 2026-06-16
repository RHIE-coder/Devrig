# DevRig

> 개발자 장비 세트빌더와 자동화 스크립트에 최적화된 유틸리티 코어

## 이름의 의미

DevRig는 개발자가 바로 작업에 들어갈 수 있도록 필요한 도구와 구성품을 한 곳에 묶어주는 "장비 세트"라는 뜻입니다. **Rig**는 개발자나 하드웨어 매니아들 사이에서 보통 **특정 목적을 위해 정교하게 짜여진 장비나 설정**을 의미합니다.

## 프로젝트 목표

- 개발에 도움이 되는 유틸리티를 모아 한 곳에서 관리
- 각종 Project Generator를 제공해 빠르게 개발에 착수
- 유틸리티 코어 지향

## 구성

| 경로 | 설명 |
|------|------|
| [`toolkit/`](toolkit) | 유틸리티 도구 모음 + 단일 진입점 게이트웨이 |
| [`toolkit/sysman/`](toolkit/sysman) | OS 상태 모니터링/제어 TUI (포트 점유·프로세스) |
| [`docs/`](docs) | 문서 (설치 가이드 등) |

### Toolkit 게이트웨이

도구가 늘어나도 각각의 실행/셋팅 방법을 외울 필요 없이 한 곳에서 다룹니다.

```bash
toolkit/install.sh      # 1회 설치 → 어디서든 'devrig' 명령 사용 (Windows: install.ps1)

devrig                  # 인터랙티브 메뉴로 도구 선택·실행
devrig list             # 도구 목록
devrig run sysman       # 바로 실행
devrig doctor           # 전제조건(런타임) 설치 여부 점검
```

설치 없이 쓰려면 `cd toolkit && go run . <명령>` 도 동일하게 동작합니다. 자세한 내용은 [toolkit/README.md](toolkit/README.md)를 참고하세요.

## 개발 환경

DevRig 도구를 빌드·실행하는 데 필요한 런타임입니다. **플랫폼별 상세 설치 방법은 [docs/setup.md](docs/setup.md)** 에 정리되어 있습니다.

| 런타임 | 용도 | 검증 |
|--------|------|------|
| Docker | 컨테이너 런타임 | `docker --version` |
| Go | Go 기반 도구(예: `sysman`) 빌드/실행 | `go version` |
| Rust | Rust 기반 도구 빌드/실행 | `rustc --version` |
| Python | Python 스크립트/도구 | `python3 --version` |
| Node.js | JS/TS 도구 | `node --version` |
| Java (JDK) | JVM 기반 도구 | `java -version` |

> 설치 후 `cd toolkit && go run . doctor`로 각 도구의 전제조건이 충족됐는지 한 번에 점검할 수 있습니다.

## 라이선스

[LICENSE](LICENSE) 참고.
