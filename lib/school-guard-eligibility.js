// 중학생은 정보 허브에는 보관하지만 선도부 관리 대상에는 포함하지 않는다.
export function isSchoolGuardEligible(student) {
  return !String(student?.grade ?? '').trim().startsWith('중');
}
