// scripts/state/flock.mjs
//
// Cross-platform advisory file lock.
// Node.js에 flock(2) 바인딩이 없으므로 lockfile 패턴으로 대체.
// .lock 파일 생성 시 O_EXCL(exclusive create)로 원자적 잠금.

import {
  openSync as fsOpen,
  closeSync as fsClose,
  unlinkSync,
  writeFileSync,
  statSync,
  constants,
} from 'node:fs';

const LOCK_SUFFIX = '.lock';
const STALE_MS = 30_000; // 30초 이상 된 lock은 stale로 간주

// fd → filePath 매핑
const fdPaths = new Map();

/**
 * 파일 경로를 열고 fd를 반환 (append 모드)
 */
export function openSync(filePath) {
  const fd = fsOpen(filePath, 'a');
  fdPaths.set(fd, filePath);
  return fd;
}

/**
 * flock 잠금 획득 (blocking spin)
 */
export function flockSync(fd) {
  const filePath = fdPaths.get(fd);
  if (!filePath) throw new Error('flock: fd에 대한 경로 정보 없음');

  const lockPath = filePath + LOCK_SUFFIX;
  const maxRetries = 100;
  const retryMs = 50;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // O_EXCL: 이미 존재하면 EEXIST로 실패 → 원자적
      const lockFd = fsOpen(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      writeFileSync(lockFd, `${process.pid}\n`);
      fsClose(lockFd);
      return; // 잠금 성공
    } catch (e) {
      if (e.code === 'EEXIST') {
        // stale lock 감지
        try {
          const { mtimeMs } = statSync(lockPath);
          if (Date.now() - mtimeMs > STALE_MS) {
            unlinkSync(lockPath);
            continue;
          }
        } catch {
          // lock 파일이 사라졌으면 재시도
          continue;
        }

        // spin wait
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs);
        continue;
      }
      throw e;
    }
  }

  throw new Error(`flock: ${maxRetries}회 재시도 후 잠금 획득 실패 — ${filePath}`);
}

/**
 * flock 잠금 해제 + fd 닫기
 */
export function closeSync(fd) {
  const filePath = fdPaths.get(fd);
  if (filePath) {
    const lockPath = filePath + LOCK_SUFFIX;
    try {
      unlinkSync(lockPath);
    } catch {
      // 이미 삭제된 경우 무시
    }
    fdPaths.delete(fd);
  }
  fsClose(fd);
}
