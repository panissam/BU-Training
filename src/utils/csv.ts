import { Personnel } from '../types';

/**
 * Smartly decode binary buffer from CSV file:
 * - Detects UTF-8 with BOM (\uFEFF / 0xEF 0xBB 0xBF)
 * - Detects Windows-874 / TIS-620 (standard Thai ANSI encoding in Microsoft Excel)
 * - Strict UTF-8 verification
 * - Allows explicit selection ('auto' | 'windows-874' | 'utf-8')
 */
export function decodeCsvBuffer(
  buffer: ArrayBuffer, 
  forcedEncoding: 'auto' | 'windows-874' | 'utf-8' = 'auto'
): { text: string; encoding: 'windows-874' | 'utf-8' } {
  const bytes = new Uint8Array(buffer);

  // Check UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    const text = new TextDecoder('utf-8').decode(bytes.slice(3));
    return { text, encoding: 'utf-8' };
  }

  if (forcedEncoding === 'windows-874') {
    try {
      const text = new TextDecoder('windows-874').decode(bytes);
      return { text, encoding: 'windows-874' };
    } catch {
      const text = new TextDecoder('utf-8').decode(bytes);
      return { text, encoding: 'utf-8' };
    }
  }

  if (forcedEncoding === 'utf-8') {
    const text = new TextDecoder('utf-8').decode(bytes);
    return { text, encoding: 'utf-8' };
  }

  // AUTO DETECTION
  // 1. Try strict UTF-8
  try {
    const strictUtf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Strict UTF-8 succeeded! Check if it contains genuine Thai characters or pure ASCII
    // If strict UTF-8 has no Thai characters, but windows-874 decoding reveals Thai characters,
    // it's possible a Windows-874 file happened to not trigger invalid sequences, so double check.
    const hasThaiInUtf8 = /[\u0E01-\u0E5B]/.test(strictUtf8);
    if (!hasThaiInUtf8) {
      try {
        const testWin874 = new TextDecoder('windows-874').decode(bytes);
        if (/[\u0E01-\u0E5B]/.test(testWin874)) {
          return { text: testWin874, encoding: 'windows-874' };
        }
      } catch {
        // keep strictUtf8
      }
    }
    return { text: strictUtf8, encoding: 'utf-8' };
  } catch {
    // 2. Fatal UTF-8 error means there are invalid UTF-8 byte sequences.
    // In Thai Excel files (Windows-874 / TIS-620), Thai bytes (0xA1-0xFB) are single-byte > 0x7F,
    // which ALWAYS throw an error in strict UTF-8 mode!
    try {
      const win874Text = new TextDecoder('windows-874').decode(bytes);
      return { text: win874Text, encoding: 'windows-874' };
    } catch {
      const fallbackText = new TextDecoder('utf-8').decode(bytes);
      return { text: fallbackText, encoding: 'utf-8' };
    }
  }
}

/**
 * Prepend BOM (\uFEFF) to make Excel recognize UTF-8 Thai text immediately.
 */
export function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const content = [
    headers.join(','),
    ...rows.map(row => row.map(v => {
      // Escape commas and double quotes for clean CSV
      const escaped = String(v ?? '').replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
        ? `"${escaped}"`
        : escaped;
    }).join(','))
  ].join('\n');
  
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Basic CSV parser supporting quotes and Thai text.
 */
export function getDisplayCurriculum(curriculum: string | undefined, department?: string | undefined): string {
  const curr = (curriculum || '').trim();

  if (
    curr && 
    curr !== '-' && 
    curr !== 'ทั่วไป' && 
    curr.toLowerCase() !== 'undefined' && 
    curr.toLowerCase() !== 'null'
  ) {
    return curr;
  }

  return '-';
}

export function parsePersonnelCSV(text: string): Omit<Personnel, 'createdAt'>[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Auto-detect delimiter: comma (,) vs semicolon (;) vs tab (\t)
  const firstLine = lines[0];
  let delimiter = ',';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (semiCount > commaCount && semiCount > tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let insideQuote = false;
    let currentField = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === delimiter && !insideQuote) {
        values.push(currentField.trim().replace(/^["\uFEFF']|["']$/g, ''));
        currentField = '';
      } else {
        currentField += char;
      }
    }
    values.push(currentField.trim().replace(/^["\uFEFF']|["']$/g, ''));
    return values;
  };

  const line0Values = parseLine(lines[0]);
  const line0Text = lines[0].toLowerCase();

  const isHeaderLine = line0Text.includes('รหัส') || 
                       line0Text.includes('ชื่อ') || 
                       line0Text.includes('ตำแหน่ง') || 
                       line0Text.includes('หลักสูตร') || 
                       line0Text.includes('ภาควิชา') || 
                       line0Text.includes('หน่วยงาน') || 
                       line0Text.includes('สังกัด') || 
                       line0Text.includes('อีเมล') || 
                       line0Text.includes('email') || 
                       line0Text.includes('name') || 
                       line0Text.includes('id');

  const rawHeaders = isHeaderLine ? line0Values.map(h => h.toLowerCase().trim()) : [];
  
  const idIdx = rawHeaders.findIndex(h => h.includes('id') || h.includes('รหัส') || h.includes('employee') || h.includes('personnel') || h.includes('code'));
  const nameIdx = rawHeaders.findIndex(h => h.includes('name') || h.includes('ชื่อ') || h.includes('นามสกุล'));
  
  // Specific position headers
  const adminPosIdx = rawHeaders.findIndex(h => h.includes('ตำแหน่งบริหาร') || h.includes('บริหาร'));
  const academicPosIdx = rawHeaders.findIndex(h => (h.includes('ตำแหน่งทางวิชาการ') || h.includes('วิชาการ')) && !h.includes('สายวิชาการ'));
  const posIdx = rawHeaders.findIndex(h => 
    h.includes('position') || 
    h.includes('ตำแหน่ง') || 
    h.includes('job') || 
    h.includes('role') ||
    h.includes('title') ||
    h.includes('rank') ||
    h.includes('หน้าที่') ||
    h.includes('สายงาน')
  );

  // Separate curriculum (หลักสูตร), academic department (ภาควิชา), and department/faculty (หน่วยงาน)
  const currIdx = rawHeaders.findIndex(h => h.includes('curriculum') || h.includes('หลักสูตร') || h.includes('program') || h.includes('สาขา') || h.includes('สาขาวิชา'));
  const academicDeptIdx = rawHeaders.findIndex(h => h.includes('ภาควิชา') || h.includes('academic_department') || h.includes('academicdepartment') || (h.includes('ภาค') && !h.includes('ภาคเรียน')));
  const deptIdx = rawHeaders.findIndex(h => !h.includes('ภาควิชา') && (h.includes('dept') || h.includes('หน่วยงาน') || h.includes('คณะ') || h.includes('department') || h.includes('สังกัด') || h.includes('สำนัก') || h.includes('faculty')));
  const emailIdx = rawHeaders.findIndex(h => h.includes('email') || h.includes('อีเมล') || h.includes('เมล์') || h.includes('mail'));
  const phoneIdx = rawHeaders.findIndex(h => h.includes('phone') || h.includes('โทรศัพท์') || h.includes('โทร') || h.includes('tel') || h.includes('mobile'));

  const sampleLine = isHeaderLine && lines.length > 1 ? parseLine(lines[1]) : line0Values;
  const numCols = sampleLine.length;

  let idPos = idIdx !== -1 ? idIdx : 0;
  let namePos = nameIdx !== -1 ? nameIdx : 1;
  let posPos = posIdx !== -1 ? posIdx : (adminPosIdx !== -1 ? adminPosIdx : (academicPosIdx !== -1 ? academicPosIdx : 2));
  let currPos = currIdx;
  let academicDeptPos = academicDeptIdx;
  let deptPos = deptIdx;
  let emailPos = emailIdx;
  let phonePos = phoneIdx;

  // Fallback positional indexing if headers are missing or not matched:
  // Standard user CSV (8 columns):
  // 0: รหัสบุคคล, 1: ชื่อ-นามสกุล, 2: ตำแหน่ง, 3: หลักสูตร, 4: ภาควิชา, 5: หน่วยงาน, 6: อีเมล, 7: โทรศัพท์
  if (emailPos === -1) {
    const emailIndexFound = sampleLine.findIndex(v => v.includes('@'));
    if (emailIndexFound !== -1) {
      emailPos = emailIndexFound;
    }
  }

  if (currPos === -1 && academicDeptPos === -1 && deptPos === -1) {
    if (numCols >= 8) {
      currPos = 3;
      academicDeptPos = 4;
      deptPos = 5;
      if (emailPos === -1) emailPos = 6;
      if (phonePos === -1) phonePos = 7;
    } else if (numCols === 7) {
      // Legacy 7-column layout: [id, name, pos, dept, curriculum, email, phone]
      deptPos = 3;
      currPos = 4;
      if (emailPos === -1) emailPos = 5;
      if (phonePos === -1) phonePos = 6;
    }
  } else {
    // If some columns were detected, deduce remaining
    if (academicDeptPos === -1 && currPos !== -1 && deptPos !== -1 && deptPos - currPos === 2) {
      academicDeptPos = currPos + 1;
    }
    if (deptPos === -1) deptPos = 5;
    if (currPos === -1) currPos = 3;
    if (emailPos === -1) emailPos = numCols > 6 ? 6 : 5;
    if (phonePos === -1) phonePos = emailPos !== -1 && numCols > emailPos + 1 ? emailPos + 1 : 7;
  }

  const results: Omit<Personnel, 'createdAt'>[] = [];
  const startLine = isHeaderLine ? 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length < 2) continue;

    const id = values[idPos] || '';
    const name = values[namePos] || '';
    
    // Position extraction: prioritize administrative role if distinct, else position or academic title
    let position = (posPos !== -1 && posPos < values.length) ? values[posPos] : '-';
    if (adminPosIdx !== -1 && adminPosIdx < values.length && values[adminPosIdx] && values[adminPosIdx] !== '-') {
      position = values[adminPosIdx];
    } else if (academicPosIdx !== -1 && (!position || position === '-') && academicPosIdx < values.length && values[academicPosIdx]) {
      position = values[academicPosIdx];
    }

    const rawCurriculum = (currPos !== -1 && currPos < values.length) ? (values[currPos] || '-') : '-';
    const academicDeptVal = (academicDeptPos !== -1 && academicDeptPos < values.length) ? (values[academicDeptPos] || '-') : '-';
    const department = (deptPos !== -1 && deptPos < values.length) ? (values[deptPos] || 'ทั่วไป') : 'ทั่วไป';
    const email = (emailPos !== -1 && emailPos < values.length) ? values[emailPos] : '';
    const phone = (phonePos !== -1 && phonePos < values.length) ? values[phonePos] : '-';

    const curriculum = getDisplayCurriculum(rawCurriculum, department);
    const academicDepartment = academicDeptVal.trim() && academicDeptVal.trim() !== '-' ? academicDeptVal.trim() : '-';

    const normEmail = email.toLowerCase().trim();
    const normId = id.trim();

    if ((normId || normEmail) && name) {
      results.push({
        id: normId || normEmail.split('@')[0] || `P${Date.now()}`,
        name: name.trim(),
        position: position.trim() || '-',
        curriculum,
        academicDepartment,
        department: department.trim() || 'ทั่วไป',
        email: normEmail,
        phone: phone.trim() || '-'
      });
    }
  }

  return results;
}
