# Security Review Reference

## OWASP Top 10 (2021)

| ID | 카테고리 | 검사 항목 |
|----|---------|----------|
| A01 | Broken Access Control | 인가 우회, 권한 상승, IDOR, 경로 조작 |
| A02 | Cryptographic Failures | 평문 저장, 약한 알고리즘 (MD5/SHA1), 키 하드코딩 |
| A03 | Injection | SQL, NoSQL, OS command, LDAP, XPath injection |
| A04 | Insecure Design | 비즈니스 로직 결함, 위협 모델 부재 |
| A05 | Security Misconfiguration | 디폴트 credential, 불필요한 기능, 과도한 에러 노출 |
| A06 | Vulnerable Components | 알려진 취약점 있는 의존성 |
| A07 | Auth Failures | 무차별 대입, 세션 고정, 약한 비밀번호 정책 |
| A08 | Software/Data Integrity | 신뢰할 수 없는 소스의 코드/데이터, CI/CD 파이프라인 |
| A09 | Logging Failures | 감사 로그 누락, 민감 데이터 로그 |
| A10 | SSRF | 서버 측 요청 위조 |

## CWE Top 25 (2023) — 주요 항목

| CWE | 이름 | 검사 포인트 |
|-----|------|-----------|
| CWE-79 | XSS | 사용자 입력 → HTML/JS 직접 삽입 |
| CWE-89 | SQL Injection | 파라미터화 안 된 쿼리 |
| CWE-352 | CSRF | 상태 변경 요청에 CSRF 토큰 누락 |
| CWE-787 | Out-of-bounds Write | 버퍼 경계 미검사 |
| CWE-862 | Missing Authorization | 인가 체크 누락 |
| CWE-434 | Unrestricted Upload | 파일 업로드 타입/크기 미검증 |
| CWE-476 | NULL Pointer Dereference | null 체크 누락 |
| CWE-502 | Deserialization | 신뢰할 수 없는 데이터 역직렬화 |

## 판단 기준

- **BLOCK**: A01, A02, A03 위반 (인가, 암호화, 인젝션)
- **NEEDS_CHANGE**: A04~A10 위반
- **PASS**: 위 항목 미발견

발견 사항은 기준 ID와 함께 보고 (예: "A03 위반 — user input이 SQL 쿼리에 직접 삽입됨").
