import { inflateRawSync } from 'node:zlib';

const DAYS = ['월', '화', '수', '목', '금'];

function xmlText(value = '') {
  return String(value).replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function unzipXlsx(buffer) {
  const endSignature = 0x06054b50;
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 0xffff - 22); index--) if (buffer.readUInt32LE(index) === endSignature) { end = index; break; }
  if (end < 0) throw new Error('엑셀 파일 형식을 확인할 수 없습니다.');
  const count = buffer.readUInt16LE(end + 10), offset = buffer.readUInt32LE(end + 16), files = new Map();
  let cursor = offset;
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('엑셀 파일 목록을 읽을 수 없습니다.');
    const method = buffer.readUInt16LE(cursor + 10), compressedSize = buffer.readUInt32LE(cursor + 20), nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32), localOffset = buffer.readUInt32LE(cursor + 42), name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('엑셀 파일 내용을 읽을 수 없습니다.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28), contentStart = localOffset + 30 + localNameLength + localExtraLength, compressed = buffer.subarray(contentStart, contentStart + compressedSize);
    files.set(name, method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function columnNumber(reference) {
  return reference.replace(/\d/g, '').split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function sheetCells(xml, sharedStrings) {
  const rows = new Map();
  for (const row of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference = /\br="([A-Z]+\d+)"/.exec(cell[1])?.[1];
      if (!reference) continue;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell[2])?.[1] ?? '';
      const shared = /\bt="s"/.test(cell[1]);
      cells.set(columnNumber(reference), shared ? (sharedStrings[Number(raw)] || '') : xmlText(raw));
    }
    rows.set(Number(row[1]), cells);
  }
  return rows;
}

export function classCode(value) {
  const firstLine = String(value || '').replace(/_x000D_/g, '\n').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  return /^(중[1-3]-\d+|[1-3]\d{2})(?=\b|_)/.exec(firstLine)?.[1] || '';
}

export function normalizeTeacherName(value) {
  return String(value || '').replace(/\s*\(\d+\)\s*$/, '').trim();
}

export function parseTimetableWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100 || buffer.length > 3 * 1024 * 1024) throw new Error('시간표 엑셀 파일 크기를 확인해주세요.');
  const files = unzipXlsx(buffer), sheet = files.get('xl/worksheets/sheet1.xml'), shared = files.get('xl/sharedStrings.xml');
  if (!sheet || !shared) throw new Error('교사별 주간시간표 형식의 엑셀 파일을 업로드해주세요.');
  const sharedStrings = [...shared.toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) => xmlText(item[1]));
  const rows = sheetCells(sheet.toString('utf8'), sharedStrings), days = new Map();
  let dayIndex = -1, previousPeriod = 0;
  for (let column = 2; column <= 36; column++) {
    const period = Number(rows.get(3)?.get(column));
    if (period === 1 && previousPeriod !== 1) dayIndex++;
    if (period && dayIndex >= 0 && dayIndex < DAYS.length) days.set(column, DAYS[dayIndex]);
    if (period) previousPeriod = period;
  }
  const teachers = [];
  for (const [rowNumber, row] of rows) {
    if (rowNumber < 4) continue;
    const name = normalizeTeacherName(row.get(1));
    if (!name) continue;
    const hours = [];
    for (let column = 2; column <= 36; column++) {
      const label = String(row.get(column) || '').replace(/_x000D_/g, '\n').replace(/\r/g, '').trim();
      if (!label) continue;
      const period = Number(rows.get(3)?.get(column));
      const day = days.get(column);
      if (!day || !Number.isInteger(period) || period < 1 || period > 9) continue;
      hours.push({ day, period, label, classCode: classCode(label) });
    }
    if (hours.length) teachers.push({ id: `teacher-${teachers.length + 1}`, name, hours });
  }
  if (teachers.length < 2) throw new Error('교사 시간표를 충분히 찾지 못했습니다. 업로드 양식을 확인해주세요.');
  return { format: 'teacher-weekly-v1', teachers };
}

function at(teacher, day, period) {
  return teacher.hours.find((item) => item.day === day && Number(item.period) === Number(period));
}

export function findSwapOptions(timetable, request) {
  const source = timetable?.teachers?.find((teacher) => teacher.id === request?.teacherId);
  const selected = source && at(source, request.day, request.period);
  if (!source || !selected) return { error: '교체할 시간표 칸을 선택해주세요.', options: [] };
  if (!selected.classCode) return { error: '학급 수업이 아닌 시간은 교체 대상으로 조회할 수 없습니다.', options: [] };
  const options = [];
  for (const candidate of timetable.teachers) {
    if (candidate.id === source.id || at(candidate, selected.day, selected.period)) continue;
    for (const returnSlot of candidate.hours.filter((item) => item.classCode === selected.classCode)) {
      if (at(source, returnSlot.day, returnSlot.period)) continue;
      options.push({ teacher: { id: candidate.id, name: candidate.name }, selected: { day: selected.day, period: selected.period, label: selected.label, classCode: selected.classCode }, returnSlot: { day: returnSlot.day, period: returnSlot.period, label: returnSlot.label } });
    }
  }
  return { source: { id: source.id, name: source.name }, selected: { day: selected.day, period: selected.period, label: selected.label, classCode: selected.classCode }, options };
}
