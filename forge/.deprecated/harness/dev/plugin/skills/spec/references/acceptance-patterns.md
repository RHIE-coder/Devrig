# Acceptance Criteria Patterns

## 1. Happy Path
```yaml
- id: AC-001
  desc: "유효한 이메일+비밀번호로 로그인하면 JWT 토큰 반환"
  testable: "POST /auth/login {valid_email, valid_pw} → 200 + JWT"
```

## 2. Error Path
```yaml
- id: AC-002
  desc: "잘못된 비밀번호로 로그인하면 401 반환"
  testable: "POST /auth/login {valid_email, wrong_pw} → 401"
```

## 3. Boundary
```yaml
- id: AC-003
  desc: "비밀번호는 8자 이상 128자 이하"
  testable: "7자 → 400, 8자 → 통과, 128자 → 통과, 129자 → 400"
```

## 4. State Transition
```yaml
- id: AC-004
  desc: "로그인 5회 실패 시 계정 잠금"
  testable: "연속 5회 잘못된 비밀번호 → 계정 locked, 6번째 시도 → 423"
```
