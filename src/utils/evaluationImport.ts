import * as XLSX from 'xlsx';
import { Personnel, Registration, SurveyQuestion } from '../types';
import { decodeCsvBuffer, downloadCSV } from './csv';

export interface ParsedSpreadsheet {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface RatingColumnMapping {
  header: string;
  targetQuestionId: string; // '__overall__' or a SurveyQuestion.id
}

export interface EvaluationColumnMapping {
  emailCol: string;
  nameCol: string;
  departmentCol: string;
  part2BeforeCol: string;
  part2AfterCol: string;
  ratingCols: RatingColumnMapping[];
  recommendationCol: string;
  commentsCol: string;
}

export interface ValidatedEvaluationRow {
  rowIndex: number; // 1-based data row number in spreadsheet (excluding header)
  rawIdentifier: string;
  matchedEmail: string | null; // valid @bu.ac.th email if provided
  name: string;
  department: string;
  satisfaction: number; // 1-5 averaged across mapped rating columns
  recommendation?: number; // 1-5 optional
  part2Before?: number; // 1-5 optional
  part2After?: number; // 1-5 optional
  comments?: string;
  answers: Record<string, number | string>;
  inFileDuplicate: boolean;
  existingRegistrationId?: string;
  existingRegistrationSource?: 'organic' | 'imported';
}

export interface InvalidEvaluationRow {
  rowIndex: number;
  rawIdentifier: string;
  reason: string;
}

export interface EvaluationValidationSummary {
  totalDataRows: number;
  validRows: ValidatedEvaluationRow[];
  invalidRows: InvalidEvaluationRow[];
  emptySkippedCount: number;
  inFileDuplicateCount: number;
  existingMatchCount: number;
  predictedAvgSatisfaction: number;
}

/**
 * Strip ASCII control characters, HTML tags, and truncate safely for Firestore limits.
 */
export function sanitizeImportedText(input: unknown, maxLength: number): string {
  if (input === null || input === undefined) return '';
  let text = String(input);
  // Strip C0 control chars except newline/tab
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Strip angle-bracket HTML tags to guard against XSS payloads
  text = text.replace(/<[^>]*>?/g, '');
  // Collapse redundant spaces/tabs per line while keeping newlines intact
  text = text
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && idx < arr.length - 1))
    .join('\n')
    .trim();

  if (text.length > maxLength) {
    return text.slice(0, maxLength).trim();
  }
  return text;
}

/**
 * Parse numeric rating on 1-5 scale.
 * Accepts "4", "4.5", "5 คะแนน", "4/5", etc.
 */
export function parseScore1to5(raw: unknown): { kind: 'empty' } | { kind: 'valid'; value: number } | { kind: 'invalid' } {
  if (raw === null || raw === undefined) return { kind: 'empty' };
  const str = String(raw).trim();
  if (!str || str === '-' || str === 'N/A' || str.toLowerCase() === 'null') {
    return { kind: 'empty' };
  }

  let candidate = str;
  const slashMatch = str.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*5(?:\.0+)?$/);
  if (slashMatch) {
    candidate = slashMatch[1];
  } else {
    // Allow trailing Thai/English label like "5 คะแนน" or "4.5 pts"
    const unitMatch = str.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:คะแนน|ดาว|pts?|points?)?$/i);
    if (unitMatch) {
      candidate = unitMatch[1];
    }
  }

  const num = Number(candidate);
  if (!Number.isFinite(num) || num < 1 || num > 5) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', value: Number(num.toFixed(2)) };
}

/**
 * Parse .xlsx, .xls, or .csv entirely on the client side with UTF-8 & Thai encoding support.
 */
export async function parseEvaluationSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const fileName = file.name || 'evaluation_file';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    throw new Error('รองรับเฉพาะไฟล์สกุล .xlsx, .xls หรือ .csv เท่านั้น');
  }

  const buffer = await file.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('ไฟล์ที่เลือกมีขนาดว่างเปล่า ไม่พบข้อมูลสำหรับนำเข้า');
  }

  let workbook: XLSX.WorkBook;
  if (ext === 'csv') {
    const { text } = decodeCsvBuffer(buffer, 'auto');
    if (!text.trim()) {
      throw new Error('ไฟล์ CSV ว่างเปล่า ไม่พบข้อมูลสำหรับนำเข้า');
    }
    workbook = XLSX.read(text, { type: 'string', raw: false });
  } else {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('ไม่พบแผ่นงาน (Worksheet) ภายในไฟล์ที่อัปโหลด');
  }

  let chosenSheetName = '';
  let matrix: unknown[][] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false
    });
    if (rows.length > 0 && rows.some(r => Array.isArray(r) && r.some(cell => String(cell ?? '').trim() !== ''))) {
      chosenSheetName = name;
      matrix = rows;
      break;
    }
  }

  if (!chosenSheetName || matrix.length === 0) {
    throw new Error('ไม่พบข้อมูลตารางภายในไฟล์ที่อัปโหลด');
  }

  // Locate header row (first non-empty row)
  const headerRowIdx = matrix.findIndex(
    row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')
  );
  if (headerRowIdx === -1) {
    throw new Error('ไม่พบแถวหัวข้อคอลัมน์ในไฟล์ที่อัปโหลด');
  }

  const rawHeaderCells = matrix[headerRowIdx] || [];
  const usedHeaders = new Map<string, number>();
  const headers: string[] = [];

  for (let i = 0; i < rawHeaderCells.length; i++) {
    const base = sanitizeImportedText(rawHeaderCells[i], 180) || `คอลัมน์ที่ ${i + 1}`;
    const count = usedHeaders.get(base) || 0;
    usedHeaders.set(base, count + 1);
    headers.push(count === 0 ? base : `${base} (${count + 1})`);
  }

  if (headers.length === 0) {
    throw new Error('ไม่พบคอลัมน์หัวข้อในไฟล์ที่อัปโหลด');
  }

  const dataRows: Record<string, string>[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowArr = matrix[r] || [];
    const obj: Record<string, string> = {};
    let hasValue = false;

    for (let c = 0; c < headers.length; c++) {
      const val = rowArr[c] !== undefined && rowArr[c] !== null ? String(rowArr[c]).trim() : '';
      obj[headers[c]] = val;
      if (val !== '') hasValue = true;
    }

    if (hasValue) {
      dataRows.push(obj);
    }
  }

  if (dataRows.length === 0) {
    throw new Error('พบหัวข้อคอลัมน์แล้ว แต่ไม่พบแถวข้อมูลผลประเมินภายในไฟล์');
  }

  return {
    fileName,
    sheetName: chosenSheetName,
    headers,
    rows: dataRows
  };
}

/**
 * Smartly auto-detect column mapping from header names and sample values.
 */
export function autoDetectColumnMapping(
  headers: string[],
  rows: Record<string, string>[],
  part3Questions: SurveyQuestion[]
): EvaluationColumnMapping {
  const lower = (h: string) => h.toLowerCase().trim();
  const sampleRows = rows.slice(0, Math.min(rows.length, 15));

  const isNumericRatingColumn = (header: string): boolean => {
    let validCount = 0;
    let nonEmptyCount = 0;
    for (const r of sampleRows) {
      const parsed = parseScore1to5(r[header]);
      if (parsed.kind !== 'empty') {
        nonEmptyCount++;
        if (parsed.kind === 'valid') validCount++;
      }
    }
    return nonEmptyCount > 0 && validCount / nonEmptyCount >= 0.7;
  };

  let emailCol = '';
  let nameCol = '';
  let departmentCol = '';
  let part2BeforeCol = '';
  let part2AfterCol = '';
  let recommendationCol = '';
  let commentsCol = '';
  const ratingCols: RatingColumnMapping[] = [];

  for (const h of headers) {
    const l = lower(h);
    if (!emailCol && (l.includes('email') || l.includes('อีเมล') || l.includes('เมล') || l.includes('mail') || l.includes('ผู้ตอบ') || l.includes('รหัส'))) {
      emailCol = h;
      continue;
    }
    if (!nameCol && (l.includes('ชื่อ') || l.includes('name') || l.includes('ผู้ประเมิน')) && !l.includes('หลักสูตร') && !l.includes('วิทยากร')) {
      nameCol = h;
      continue;
    }
    if (!departmentCol && (l.includes('สังกัด') || l.includes('หน่วยงาน') || l.includes('คณะ') || l.includes('ภาควิชา') || l.includes('department') || l.includes('faculty') || l.includes('affiliation'))) {
      departmentCol = h;
      continue;
    }
    if (!part2BeforeCol && (l.includes('ก่อนอบรม') || l.includes('ก่อนเข้า') || l.includes('before') || l.includes('pre-test') || l.includes('pretest'))) {
      part2BeforeCol = h;
      continue;
    }
    if (!part2AfterCol && (l.includes('หลังอบรม') || l.includes('หลังเข้า') || l.includes('after') || l.includes('post-test') || l.includes('posttest'))) {
      part2AfterCol = h;
      continue;
    }
    if (!recommendationCol && (l.includes('แนะนำ') || l.includes('recommend') || l.includes('nps') || l.includes('บอกต่อ'))) {
      recommendationCol = h;
      continue;
    }
    if (!commentsCol && (l.includes('ข้อเสนอแนะ') || l.includes('ความคิดเห็น') || l.includes('ข้อคิดเห็น') || l.includes('คำแนะนำ') || l.includes('ความรู้สึก') || l.includes('comment') || l.includes('suggestion') || l.includes('feedback') || l.includes('หมายเหตุ'))) {
      commentsCol = h;
      continue;
    }
  }

  // Fallback: detect email column by sample values containing '@'
  if (!emailCol) {
    const detected = headers.find(h =>
      sampleRows.some(r => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((r[h] || '').trim()))
    );
    if (detected) emailCol = detected;
  }

  const assignedSpecial = new Set(
    [emailCol, nameCol, departmentCol, part2BeforeCol, part2AfterCol, recommendationCol, commentsCol].filter(Boolean)
  );

  const ratingQuestions = part3Questions.filter(q => q.type === 'rating');
  const usedQuestionIds = new Set<string>();

  const matchQuestionId = (header: string): string => {
    const hNorm = lower(header);
    // Exact or strong partial overlap with a part3 rating question
    for (const q of ratingQuestions) {
      if (usedQuestionIds.has(q.id)) continue;
      const qNorm = lower(q.text);
      if (hNorm.includes(qNorm) || qNorm.includes(hNorm)) {
        usedQuestionIds.add(q.id);
        return q.id;
      }
      // Keyword overlap (tokens length >= 3)
      const qTokens = qNorm.split(/[\s/:(),.-]+/).filter(t => t.length >= 3);
      const matches = qTokens.filter(t => hNorm.includes(t));
      if (matches.length >= 2 || (qTokens.length <= 2 && matches.length >= 1)) {
        usedQuestionIds.add(q.id);
        return q.id;
      }
    }
    return '__overall__';
  };

  for (const h of headers) {
    if (assignedSpecial.has(h)) continue;
    const l = lower(h);
    // Skip obvious timestamps / metadata columns
    if (l.includes('timestamp') || l.includes('ประทับเวลา') || l.includes('วันที่') || l === 'id' || l === 'no' || l === 'ลำดับ') {
      continue;
    }
    const looksLikeScoreHeader =
      l.includes('พึงพอใจ') ||
      l.includes('คะแนน') ||
      l.includes('ระดับ') ||
      l.includes('ความเหมาะสม') ||
      l.includes('เนื้อหา') ||
      l.includes('วิทยากร') ||
      l.includes('ระยะเวลา') ||
      l.includes('รูปแบบ') ||
      l.includes('ประสานงาน') ||
      l.includes('อาหาร') ||
      l.includes('satisfaction') ||
      l.includes('rating') ||
      l.includes('score') ||
      l.includes('1-5') ||
      l.includes('1–5');

    if (looksLikeScoreHeader || isNumericRatingColumn(h)) {
      if (isNumericRatingColumn(h) || looksLikeScoreHeader) {
        ratingCols.push({
          header: h,
          targetQuestionId: matchQuestionId(h)
        });
      }
    }
  }

  return {
    emailCol,
    nameCol,
    departmentCol,
    part2BeforeCol,
    part2AfterCol,
    ratingCols,
    recommendationCol,
    commentsCol
  };
}

/**
 * Validate & sanitize parsed spreadsheet rows using the confirmed column mapping.
 */
export function validateEvaluationRows(
  rows: Record<string, string>[],
  mapping: EvaluationColumnMapping,
  courseId: string,
  existingRegistrations: Registration[],
  personnelList: Personnel[],
  part3Questions: SurveyQuestion[]
): EvaluationValidationSummary {
  const validRows: ValidatedEvaluationRow[] = [];
  const invalidRows: InvalidEvaluationRow[] = [];
  let emptySkippedCount = 0;
  let inFileDuplicateCount = 0;
  let existingMatchCount = 0;

  const seenEmails = new Set<string>();
  const courseRegsByEmail = new Map<string, Registration>();
  for (const reg of existingRegistrations) {
    if (reg.courseId === courseId && reg.email) {
      courseRegsByEmail.set(reg.email.toLowerCase().trim(), reg);
    }
  }

  const personnelByEmail = new Map<string, Personnel>();
  for (const p of personnelList) {
    if (p.email) {
      personnelByEmail.set(p.email.toLowerCase().trim(), p);
    }
  }

  const textQuestion = part3Questions.find(q => q.type === 'text');

  rows.forEach((row, idx) => {
    const rowIndex = idx + 1;

    const rawEmail = mapping.emailCol ? (row[mapping.emailCol] || '').trim() : '';
    const rawName = mapping.nameCol ? (row[mapping.nameCol] || '').trim() : '';
    const rawDept = mapping.departmentCol ? (row[mapping.departmentCol] || '').trim() : '';
    const rawBefore = mapping.part2BeforeCol ? (row[mapping.part2BeforeCol] || '').trim() : '';
    const rawAfter = mapping.part2AfterCol ? (row[mapping.part2AfterCol] || '').trim() : '';
    const rawRec = mapping.recommendationCol ? (row[mapping.recommendationCol] || '').trim() : '';
    const rawComments = mapping.commentsCol ? (row[mapping.commentsCol] || '').trim() : '';
    const rawRatings = mapping.ratingCols.map(rc => (row[rc.header] || '').trim());

    const allBlank =
      !rawEmail &&
      !rawName &&
      !rawDept &&
      !rawBefore &&
      !rawAfter &&
      !rawRec &&
      !rawComments &&
      rawRatings.every(v => !v);

    if (allBlank) {
      emptySkippedCount++;
      return;
    }

    const sanitizedIdentifier = sanitizeImportedText(rawEmail, 160);
    const normalizedEmail = sanitizedIdentifier.toLowerCase();
    const isBuEmail = /^[^\s@]+@bu\.ac\.th$/.test(normalizedEmail);

    if (mapping.ratingCols.length === 0) {
      invalidRows.push({
        rowIndex,
        rawIdentifier: sanitizedIdentifier || `แถวที่ ${rowIndex}`,
        reason: 'ยังไม่ได้เลือกคอลัมน์คะแนนความพึงพอใจ (1-5)'
      });
      return;
    }

    const numericScores: number[] = [];
    const answers: Record<string, number | string> = {};
    let hasInvalidRating = false;

    for (const rc of mapping.ratingCols) {
      const parsed = parseScore1to5(row[rc.header]);
      if (parsed.kind === 'invalid') {
        hasInvalidRating = true;
        break;
      }
      if (parsed.kind === 'valid') {
        numericScores.push(parsed.value);
        if (rc.targetQuestionId && rc.targetQuestionId !== '__overall__') {
          answers[rc.targetQuestionId] = parsed.value;
        }
      }
    }

    if (hasInvalidRating) {
      invalidRows.push({
        rowIndex,
        rawIdentifier: sanitizedIdentifier || `แถวที่ ${rowIndex}`,
        reason: 'คะแนนความพึงพอใจไม่อยู่ในช่วง 1–5 หรือไม่ใช่ตัวเลข'
      });
      return;
    }

    if (numericScores.length === 0) {
      invalidRows.push({
        rowIndex,
        rawIdentifier: sanitizedIdentifier || `แถวที่ ${rowIndex}`,
        reason: 'ไม่พบค่าคะแนนความพึงพอใจ (1–5) ในแถวนี้'
      });
      return;
    }

    const avgSatisfaction = Number(
      (numericScores.reduce((sum, v) => sum + v, 0) / numericScores.length).toFixed(2)
    );

    let recommendation: number | undefined;
    if (mapping.recommendationCol && rawRec) {
      const parsedRec = parseScore1to5(rawRec);
      if (parsedRec.kind === 'invalid') {
        invalidRows.push({
          rowIndex,
          rawIdentifier: sanitizedIdentifier || `แถวที่ ${rowIndex}`,
          reason: 'คะแนนแนะนำต่อไม่อยู่ในช่วง 1–5 หรือไม่ใช่ตัวเลข'
        });
        return;
      }
      if (parsedRec.kind === 'valid') {
        recommendation = parsedRec.value;
      }
    }

    let part2Before: number | undefined;
    if (mapping.part2BeforeCol && rawBefore) {
      const parsedBefore = parseScore1to5(rawBefore);
      if (parsedBefore.kind === 'invalid') {
        invalidRows.push({
          rowIndex,
          rawIdentifier: sanitizedIdentifier || `แถวที่ ${rowIndex}`,
          reason: 'คะแนนความรู้ก่อนอบรมไม่อยู่ในช่วง 1–5'
        });
        return;
      }
      if (parsedBefore.kind === 'valid') {
        part2Before = parsedBefore.value;
      }
    }

    let part2After: number | undefined;
    if (mapping.part2AfterCol && rawAfter) {
      const parsedAfter = parseScore1to5(rawAfter);
      if (parsedAfter.kind === 'invalid') {
        invalidRows.push({
          rowIndex,
          rawIdentifier: sanitizedIdentifier || `แถวที่ ${rowIndex}`,
          reason: 'คะแนนความรู้หลังอบรมไม่อยู่ในช่วง 1–5'
        });
        return;
      }
      if (parsedAfter.kind === 'valid') {
        part2After = parsedAfter.value;
      }
    }

    const sanitizedComments = sanitizeImportedText(rawComments, 2000);
    if (sanitizedComments && textQuestion) {
      answers[textQuestion.id] = sanitizedComments;
    }

    let inFileDuplicate = false;
    if (sanitizedIdentifier) {
      if (seenEmails.has(normalizedEmail)) {
        inFileDuplicate = true;
        inFileDuplicateCount++;
      } else {
        seenEmails.add(normalizedEmail);
      }
    }

    const matchedPerson = isBuEmail ? personnelByEmail.get(normalizedEmail) : undefined;
    const existingReg = isBuEmail ? courseRegsByEmail.get(normalizedEmail) : undefined;
    if (existingReg) {
      existingMatchCount++;
    }

    const resolvedName =
      sanitizeImportedText(rawName, 200) ||
      matchedPerson?.name ||
      existingReg?.name ||
      (sanitizedIdentifier && !isBuEmail ? sanitizedIdentifier : '') ||
      `ผู้ประเมินนำเข้า #${rowIndex}`;

    const resolvedDept =
      sanitizeImportedText(rawDept, 200) ||
      matchedPerson?.department ||
      existingReg?.department ||
      'ไม่ระบุสังกัด (นำเข้า)';

    validRows.push({
      rowIndex,
      rawIdentifier: sanitizedIdentifier,
      matchedEmail: isBuEmail ? normalizedEmail : null,
      name: resolvedName,
      department: resolvedDept,
      satisfaction: avgSatisfaction,
      recommendation,
      part2Before,
      part2After,
      comments: sanitizedComments || undefined,
      answers,
      inFileDuplicate,
      existingRegistrationId: existingReg?.id,
      existingRegistrationSource: existingReg?.source
    });
  });

  const predictedAvgSatisfaction =
    validRows.length > 0
      ? Number(
          (validRows.reduce((sum, r) => sum + r.satisfaction, 0) / validRows.length).toFixed(2)
        )
      : 0;

  return {
    totalDataRows: rows.length,
    validRows,
    invalidRows,
    emptySkippedCount,
    inFileDuplicateCount,
    existingMatchCount,
    predictedAvgSatisfaction
  };
}

/**
 * Create a Firestore-safe registration document ID (<= 128 chars).
 */
export function buildSafeRegistrationId(prefix: string, suffix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const cleanSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const combined = `${cleanPrefix}_${cleanSuffix}`;
  if (combined.length <= 128) return combined;

  // Deterministic lightweight hash suffix when combined ID exceeds 128 chars
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
  }
  const hashStr = hash.toString(36);
  return `${cleanPrefix}_${cleanSuffix.slice(0, 128 - cleanPrefix.length - hashStr.length - 2)}_${hashStr}`;
}

/**
 * Download a UTF-8 BOM CSV template matching the selected course evaluation structure.
 */
export function downloadEvaluationTemplate(courseTitle: string, part3Questions: SurveyQuestion[]): void {
  const ratingQs = part3Questions.filter(q => q.type === 'rating').slice(0, 4);
  const qHeaders =
    ratingQs.length > 0
      ? ratingQs.map(q => `คะแนน: ${q.text} (1-5)`)
      : ['คะแนนด้านเนื้อหาการอบรม (1-5)', 'คะแนนด้านวิทยากร (1-5)', 'ความพึงพอใจโดยรวม (1-5)'];

  const headers = [
    'อีเมล (Email)',
    'สังกัด/หน่วยงาน (Department)',
    'ความรู้ความเข้าใจก่อนอบรม (1-5)',
    'ความรู้ความเข้าใจหลังอบรม (1-5)',
    ...qHeaders,
    'คะแนนแนะนำต่อ (1-5)',
    'ข้อเสนอแนะเพิ่มเติม (Comments)'
  ];

  const sampleScoreFill = (score: string) => qHeaders.map(() => score);
  const rows = [
    [
      'sample.instructor@bu.ac.th',
      'คณะเทคโนโลยีสารสนเทศและนวัตกรรม',
      '3',
      '5',
      ...sampleScoreFill('5'),
      '5',
      'เนื้อหาชัดเจน นำไปประยุกต์ใช้ในการสอนได้จริง'
    ],
    [
      'sample.staff@bu.ac.th',
      'คณะบริหารธุรกิจ',
      '3',
      '4',
      ...sampleScoreFill('4'),
      '4',
      'วิทยากรอธิบายเข้าใจง่าย อยากให้มีเวิร์กชอปเพิ่มเติม'
    ]
  ];

  const safeTitle = (courseTitle || 'หลักสูตร').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  downloadCSV(`ตัวอย่างไฟล์นำเข้าผลประเมิน_${safeTitle}.csv`, headers, rows);
}
