import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { deleteField, doc, writeBatch } from 'firebase/firestore';
import { db, cleanForFirestore, handleFirestoreError, OperationType } from '../firebase';
import { Course, EvaluationConfig, Feedback, Personnel, Registration } from '../types';
import {
  autoDetectColumnMapping,
  buildSafeRegistrationId,
  downloadEvaluationTemplate,
  EvaluationColumnMapping,
  parseEvaluationSpreadsheet,
  ParsedSpreadsheet,
  parseScore1to5,
  validateEvaluationRows
} from '../utils/evaluationImport';

export interface EvaluationImportResult {
  courseId: string;
  courseTitle: string;
  importedCount: number;
  updatedExistingCount: number;
  replacedRemovedCount: number;
  skippedInvalidCount: number;
  skippedDuplicateCount: number;
  mode: 'append' | 'replace';
  predictedAvgSatisfaction: number;
}

interface EvaluationImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course;
  evaluationConfig: EvaluationConfig;
  registrations: Registration[];
  personnel: Personnel[];
  onImportComplete: (result: EvaluationImportResult) => void;
}

export const EvaluationImportModal: React.FC<EvaluationImportModalProps> = ({
  isOpen,
  onClose,
  course,
  evaluationConfig,
  registrations,
  personnel,
  onImportComplete
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  const [parsedSheet, setParsedSheet] = useState<ParsedSpreadsheet | null>(null);
  const [mapping, setMapping] = useState<EvaluationColumnMapping>({
    emailCol: '',
    nameCol: '',
    departmentCol: '',
    part2BeforeCol: '',
    part2AfterCol: '',
    ratingCols: [],
    recommendationCol: '',
    commentsCol: ''
  });

  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [skipInFileDuplicates, setSkipInFileDuplicates] = useState<boolean>(true);
  const [showInvalidDetails, setShowInvalidDetails] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [submitError, setSubmitError] = useState('');

  const part3Questions = evaluationConfig.part3Questions || [];
  const ratingQuestions = useMemo(
    () => part3Questions.filter(q => q.type === 'rating'),
    [part3Questions]
  );

  const existingImportedCount = useMemo(
    () =>
      registrations.filter(
        r => r.courseId === course.id && (r.source === 'imported' || r.feedback?.source === 'imported')
      ).length,
    [registrations, course.id]
  );

  const validation = useMemo(() => {
    if (!parsedSheet) return null;
    return validateEvaluationRows(
      parsedSheet.rows,
      mapping,
      course.id,
      registrations,
      personnel,
      part3Questions
    );
  }, [parsedSheet, mapping, course.id, registrations, personnel, part3Questions]);

  const rowsToWrite = useMemo(() => {
    if (!validation) return [];
    return skipInFileDuplicates
      ? validation.validRows.filter(r => !r.inFileDuplicate)
      : validation.validRows;
  }, [validation, skipInFileDuplicates]);

  const predictedImportAvg = useMemo(() => {
    if (rowsToWrite.length === 0) return 0;
    const sum = rowsToWrite.reduce((acc, r) => acc + r.satisfaction, 0);
    return Number((sum / rowsToWrite.length).toFixed(2));
  }, [rowsToWrite]);

  if (!isOpen) return null;

  const resetFileState = () => {
    setParsedSheet(null);
    setParseError('');
    setSubmitError('');
    setShowInvalidDetails(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    setSubmitError('');
    setShowInvalidDetails(false);

    try {
      const sheet = await parseEvaluationSpreadsheet(file);
      const detected = autoDetectColumnMapping(sheet.headers, sheet.rows, part3Questions);
      setParsedSheet(sheet);
      setMapping(detected);
    } catch (err) {
      setParsedSheet(null);
      setParseError(err instanceof Error ? err.message : 'ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์อีกครั้ง');
    } finally {
      setParsing(false);
    }
  };

  const toggleRatingColumn = (header: string) => {
    setMapping(prev => {
      const exists = prev.ratingCols.some(rc => rc.header === header);
      if (exists) {
        return {
          ...prev,
          ratingCols: prev.ratingCols.filter(rc => rc.header !== header)
        };
      }
      return {
        ...prev,
        ratingCols: [...prev.ratingCols, { header, targetQuestionId: '__overall__' }]
      };
    });
  };

  const updateRatingTargetQuestion = (header: string, targetQuestionId: string) => {
    setMapping(prev => ({
      ...prev,
      ratingCols: prev.ratingCols.map(rc =>
        rc.header === header ? { ...rc, targetQuestionId } : rc
      )
    }));
  };

  const headerLooksNumeric1to5 = (header: string): boolean => {
    if (!parsedSheet || parsedSheet.rows.length === 0) return false;
    const sample = parsedSheet.rows.slice(0, 12);
    let nonEmpty = 0;
    let valid = 0;
    for (const row of sample) {
      const p = parseScore1to5(row[header]);
      if (p.kind !== 'empty') {
        nonEmpty++;
        if (p.kind === 'valid') valid++;
      }
    }
    return nonEmpty > 0 && valid / nonEmpty >= 0.6;
  };

  const handleConfirmImport = async () => {
    if (!parsedSheet || !validation) return;
    if (mapping.ratingCols.length === 0) {
      setSubmitError('กรุณาเลือกอย่างน้อย 1 คอลัมน์ที่เป็นคะแนนความพึงพอใจ (1–5)');
      return;
    }
    if (rowsToWrite.length === 0) {
      setSubmitError('ไม่พบแถวข้อมูลที่ผ่านการตรวจสอบความถูกต้องสำหรับบันทึก');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setProgressText('กำลังเตรียมข้อมูลสำหรับบันทึกเข้าสู่ระบบ...');

    const nowIso = new Date().toISOString();
    const batchTag = Date.now().toString(36);

    const personnelByEmail = new Map<string, Personnel>();
    for (const p of personnel) {
      if (p.email) personnelByEmail.set(p.email.toLowerCase().trim(), p);
    }

    const courseRegsByEmail = new Map<string, Registration>();
    for (const r of registrations) {
      if (r.courseId === course.id && r.email) {
        courseRegsByEmail.set(r.email.toLowerCase().trim(), r);
      }
    }

    try {
      type BatchOp =
        | { kind: 'set'; id: string; data: Record<string, unknown> }
        | { kind: 'update'; id: string; data: Record<string, unknown> }
        | { kind: 'delete'; id: string };

      const ops: BatchOp[] = [];
      let replacedRemovedCount = 0;
      let updatedExistingCount = 0;
      let newlyCreatedCount = 0;

      const incomingMatchedRegIds = new Set(
        rowsToWrite.map(r => r.existingRegistrationId).filter((id): id is string => Boolean(id))
      );

      // In "replace" mode, clean up previously imported records for this course first
      if (importMode === 'replace') {
        const previouslyImported = registrations.filter(
          r =>
            r.courseId === course.id &&
            (r.source === 'imported' || r.feedback?.source === 'imported')
        );

        for (const prevReg of previouslyImported) {
          if (prevReg.source === 'imported') {
            ops.push({ kind: 'delete', id: prevReg.id });
            replacedRemovedCount++;
          } else if (!incomingMatchedRegIds.has(prevReg.id)) {
            // Preserve organic attendance registration; remove only its previously imported feedback
            ops.push({
              kind: 'update',
              id: prevReg.id,
              data: { feedback: deleteField() }
            });
            replacedRemovedCount++;
          }
        }
      }

      const usedDocIdsInBatch = new Set<string>();

      for (const row of rowsToWrite) {
        const feedbackPayload: Feedback = {
          satisfaction: row.satisfaction,
          submittedAt: nowIso,
          source: 'imported',
          importedAt: nowIso,
          ...(row.recommendation !== undefined ? { recommendation: row.recommendation } : {}),
          ...(row.part2Before !== undefined ? { part2Before: row.part2Before } : {}),
          ...(row.part2After !== undefined ? { part2After: row.part2After } : {}),
          ...(row.comments ? { comments: row.comments } : {}),
          ...(row.department ? { affiliation: row.department } : {}),
          ...(Object.keys(row.answers).length > 0 ? { answers: row.answers } : {})
        };

        const existingReg = row.matchedEmail ? courseRegsByEmail.get(row.matchedEmail) : undefined;
        // Only update the existing registration doc if it wasn't just scheduled for deletion (i.e. organic reg)
        const canUpdateExisting =
          existingReg &&
          !(importMode === 'replace' && existingReg.source === 'imported') &&
          !usedDocIdsInBatch.has(existingReg.id);

        if (canUpdateExisting && existingReg) {
          usedDocIdsInBatch.add(existingReg.id);
          ops.push({
            kind: 'update',
            id: existingReg.id,
            data: cleanForFirestore({
              checkedIn: true,
              checkedInAt:
                typeof existingReg.checkedInAt === 'string' && existingReg.checkedInAt.length <= 40
                  ? existingReg.checkedInAt
                  : nowIso,
              feedback: feedbackPayload
            }) as Record<string, unknown>
          });
          updatedExistingCount++;
          continue;
        }

        const matchedPerson = row.matchedEmail ? personnelByEmail.get(row.matchedEmail) : undefined;
        const safeEmail =
          row.matchedEmail ||
          `imported.${course.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) || 'course'}.${batchTag}.${row.rowIndex}@bu.ac.th`.toLowerCase();

        const baseSuffix = row.matchedEmail
          ? `${row.matchedEmail.replace(/\./g, '_')}${row.inFileDuplicate ? `_dup${row.rowIndex}_${batchTag}` : ''}`
          : `imp_${batchTag}_${row.rowIndex}`;

        let regId = buildSafeRegistrationId(course.id, baseSuffix);
        if (usedDocIdsInBatch.has(regId)) {
          regId = buildSafeRegistrationId(course.id, `${baseSuffix}_${row.rowIndex}_${batchTag}`);
        }
        usedDocIdsInBatch.add(regId);

        const safePersonnelId = (matchedPerson?.id || `IMP-${row.rowIndex}`).slice(0, 50) || `IMP-${row.rowIndex}`;
        const safeName = row.name.slice(0, 200) || `ผู้ประเมินนำเข้า #${row.rowIndex}`;
        const safeDept = row.department.slice(0, 200) || 'ไม่ระบุสังกัด (นำเข้า)';

        const newRegistration: Registration = {
          id: regId,
          courseId: course.id,
          email: safeEmail,
          personnelId: safePersonnelId,
          name: safeName,
          department: safeDept,
          ...(matchedPerson?.position ? { position: matchedPerson.position.slice(0, 500) } : {}),
          registeredAt: nowIso,
          checkedIn: true,
          checkedInAt: nowIso,
          source: 'imported',
          ...(row.rawIdentifier && !row.matchedEmail ? { originalIdentifier: row.rawIdentifier } : {}),
          feedback: feedbackPayload
        };

        ops.push({
          kind: 'set',
          id: regId,
          data: cleanForFirestore(newRegistration) as unknown as Record<string, unknown>
        });
        newlyCreatedCount++;
      }

      // Commit in batches <= 400 operations (Firestore max is 500 per batch)
      const CHUNK_SIZE = 400;
      const totalChunks = Math.max(1, Math.ceil(ops.length / CHUNK_SIZE));

      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
        setProgressText(`กำลังบันทึกข้อมูลเข้าฐานข้อมูล... (ชุดที่ ${chunkIndex} / ${totalChunks})`);
        const batch = writeBatch(db);
        const chunk = ops.slice(i, i + CHUNK_SIZE);

        for (const op of chunk) {
          const ref = doc(db, 'registrations', op.id);
          if (op.kind === 'delete') {
            batch.delete(ref);
          } else if (op.kind === 'update') {
            batch.update(ref, op.data);
          } else {
            batch.set(ref, op.data);
          }
        }

        await batch.commit();
      }

      // Calculate combined average satisfaction after import for feedback banner
      const skippedDuplicateCount = skipInFileDuplicates ? validation.inFileDuplicateCount : 0;

      onImportComplete({
        courseId: course.id,
        courseTitle: course.title,
        importedCount: newlyCreatedCount + updatedExistingCount,
        updatedExistingCount,
        replacedRemovedCount,
        skippedInvalidCount: validation.invalidRows.length,
        skippedDuplicateCount,
        mode: importMode,
        predictedAvgSatisfaction: predictedImportAvg
      });
      onClose();
    } catch (err) {
      console.error('Evaluation import write error:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'registrations');
      } catch (wrapped) {
        setSubmitError(
          `บันทึกข้อมูลไม่สำเร็จ: ${wrapped instanceof Error ? wrapped.message : 'กรุณาตรวจสอบสิทธิ์แอดมินและรูปแบบข้อมูลอีกครั้ง'}`
        );
      }
    } finally {
      setSubmitting(false);
      setProgressText('');
    }
  };

  return (
    <div className="fixed inset-0 z-[999] bg-[#071A4B]/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 border-b-2 border-b-[#F97316] flex items-start justify-between gap-4 bg-[#071A4B] text-white">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#F97316] text-white flex items-center justify-center shrink-0 shadow-xs">
              <Upload className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block w-5 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-300">
                  External Evaluation Import
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-white">
                นำเข้าผลประเมินจาก <span className="text-[#F97316]">Excel / CSV</span>
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                หลักสูตร: <span className="font-bold text-white">{course.title}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadEvaluationTemplate(course.title, part3Questions)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-white/15 bg-[#0D2566] hover:bg-white/15 text-white text-xs font-bold transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#F97316]" />
              <span>ดาวน์โหลดไฟล์ตัวอย่าง (.csv)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="p-2 rounded-full border border-white/15 bg-[#0D2566] hover:bg-white/15 text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-40"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Dropzone */}
          <div
            onDragOver={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0] || null;
              handleFileSelected(file);
            }}
            className={`rounded-2xl border-2 border-dashed p-6 transition ${
              isDragging
                ? 'border-[#F97316] bg-orange-50/70'
                : parsedSheet
                ? 'border-emerald-300 bg-emerald-50/40'
                : 'border-[#CBD5E1] bg-[#F5F7FA] hover:border-[#071A4B]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => handleFileSelected(e.target.files?.[0] || null)}
            />

            {parsing ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2 text-[#071A4B]">
                <Loader2 className="h-7 w-7 animate-spin text-[#F97316]" />
                <p className="text-xs font-bold">กำลังอ่านและถอดรหัสไฟล์ภาษาไทย...</p>
              </div>
            ) : !parsedSheet ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 text-center sm:text-left">
                  <div className="w-12 h-12 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-5 w-5 text-[#F97316]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-[#071A4B]">
                      ลากไฟล์ผลประเมินมาวางที่นี่ หรือเลือกไฟล์จากเครื่อง
                    </p>
                    <p className="text-xs text-slate-500">
                      รองรับไฟล์ <span className="font-bold text-[#071A4B]">.xlsx, .xls, .csv</span> (รองรับภาษาไทย UTF-8 และ Windows-874 จาก Google Forms / Excel)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-full bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-bold shadow-xs transition shrink-0 cursor-pointer"
                >
                  เลือกไฟล์จากเครื่อง
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-[#071A4B]">
                      {parsedSheet.fileName}
                      <span className="ml-2 text-[11px] font-semibold text-slate-500">
                        (แผ่นงาน: {parsedSheet.sheetName})
                      </span>
                    </p>
                    <p className="text-xs text-emerald-700 font-bold tabular-nums">
                      ตรวจพบข้อมูลทั้งหมด {parsedSheet.rows.length} แถว • {parsedSheet.headers.length} คอลัมน์
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-full border border-[#E2E8F0] bg-white hover:border-[#071A4B] text-[#071A4B] text-xs font-bold transition cursor-pointer"
                  >
                    เปลี่ยนไฟล์
                  </button>
                  <button
                    type="button"
                    onClick={resetFileState}
                    className="px-3.5 py-2 rounded-full border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 text-xs font-bold transition cursor-pointer"
                  >
                    ล้างไฟล์
                  </button>
                </div>
              </div>
            )}
          </div>

          {parseError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-800">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold leading-relaxed">{parseError}</div>
            </div>
          )}

          {/* Column Mapping & Preview */}
          {parsedSheet && validation && (
            <>
              {/* Step 1: Column Mapping */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                      <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#EA580C]">
                        Column Mapping
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-[#071A4B] mt-0.5">
                      ตรวจสอบและจับคู่คอลัมน์จากไฟล์อัปโหลด
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    ระบบตรวจจับให้อัตโนมัติ สามารถปรับเปลี่ยนได้
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Email / Identifier */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#071A4B] block">
                      อีเมลผู้ตอบ / รหัสอ้างอิง <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                    </label>
                    <select
                      value={mapping.emailCol}
                      onChange={e => setMapping(prev => ({ ...prev, emailCol: e.target.value }))}
                      className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                    >
                      <option value="">-- ไม่ระบุ (สร้างรหัสนำเข้าอัตโนมัติ) --</option>
                      {parsedSheet.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Department */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#071A4B] block">
                      สังกัด / คณะ / หน่วยงาน <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                    </label>
                    <select
                      value={mapping.departmentCol}
                      onChange={e => setMapping(prev => ({ ...prev, departmentCol: e.target.value }))}
                      className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                    >
                      <option value="">-- ไม่ระบุ --</option>
                      {parsedSheet.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Respondent Name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#071A4B] block">
                      ชื่อผู้ประเมิน <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                    </label>
                    <select
                      value={mapping.nameCol}
                      onChange={e => setMapping(prev => ({ ...prev, nameCol: e.target.value }))}
                      className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                    >
                      <option value="">-- ไม่ระบุ (ดึงจากฐานข้อมูลหรือใช้ชื่อนำเข้า) --</option>
                      {parsedSheet.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Recommendation */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#071A4B] block">
                      คะแนนแนะนำต่อ (1–5) <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                    </label>
                    <select
                      value={mapping.recommendationCol}
                      onChange={e => setMapping(prev => ({ ...prev, recommendationCol: e.target.value }))}
                      className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                    >
                      <option value="">-- ไม่มีคอลัมน์แนะนำต่อ --</option>
                      {parsedSheet.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Part 2 Before */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#071A4B] block">
                      ความรู้ก่อนอบรม (1–5) <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                    </label>
                    <select
                      value={mapping.part2BeforeCol}
                      onChange={e => setMapping(prev => ({ ...prev, part2BeforeCol: e.target.value }))}
                      className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                    >
                      <option value="">-- ไม่ระบุ --</option>
                      {parsedSheet.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Part 2 After */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#071A4B] block">
                      ความรู้หลังอบรม (1–5) <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                    </label>
                    <select
                      value={mapping.part2AfterCol}
                      onChange={e => setMapping(prev => ({ ...prev, part2AfterCol: e.target.value }))}
                      className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                    >
                      <option value="">-- ไม่ระบุ --</option>
                      {parsedSheet.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Open-ended Comments */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#071A4B] block">
                    ข้อเสนอแนะ / ความคิดเห็นเพิ่มเติม <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                  </label>
                  <select
                    value={mapping.commentsCol}
                    onChange={e => setMapping(prev => ({ ...prev, commentsCol: e.target.value }))}
                    className="w-full bg-[#F5F7FA] border border-[#E2E8F0] p-2.5 rounded-xl text-xs font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                  >
                    <option value="">-- ไม่มีคอลัมน์ข้อเสนอแนะ --</option>
                    {parsedSheet.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Multi-column Rating Mapper */}
                <div className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-extrabold text-[#071A4B]">
                      คอลัมน์คะแนนความพึงพอใจ (ระดับ 1–5) <span className="text-[#EA580C]">* เลือกได้หลายข้อคำถาม</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      ระบบจะคำนวณค่าเฉลี่ยจากคอลัมน์ที่เลือกเป็นคะแนนความพึงพอใจรวมต่อคน
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                    {parsedSheet.headers.map(header => {
                      const activeItem = mapping.ratingCols.find(rc => rc.header === header);
                      const isNumeric = headerLooksNumeric1to5(header);

                      return (
                        <div
                          key={header}
                          className={`rounded-xl border p-2.5 transition flex flex-col gap-2 ${
                            activeItem
                              ? 'border-[#F97316] bg-orange-50/50'
                              : 'border-[#E2E8F0] bg-[#F5F7FA]'
                          }`}
                        >
                          <label className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(activeItem)}
                              onChange={() => toggleRatingColumn(header)}
                              className="mt-0.5 rounded text-[#F97316] focus:ring-[#F97316] cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-bold text-[#071A4B] break-words block">
                                {header}
                              </span>
                              {isNumeric && (
                                <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full mt-1">
                                  ตรวจพบตัวเลข 1–5
                                </span>
                              )}
                            </div>
                          </label>

                          {activeItem && (
                            <select
                              value={activeItem.targetQuestionId}
                              onChange={e => updateRatingTargetQuestion(header, e.target.value)}
                              className="w-full bg-white border border-orange-200 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#071A4B] focus:outline-none focus:border-[#F97316]"
                            >
                              <option value="__overall__">รวมในค่าเฉลี่ยความพึงพอใจโดยรวม</option>
                              {ratingQuestions.map((q, idx) => (
                                <option key={q.id} value={q.id}>
                                  เชื่อมหัวข้อที่ {idx + 1}: {q.text}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Step 2: Import Mode */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                  <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#EA580C]">
                    Import Mode
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                      importMode === 'append'
                        ? 'border-[#071A4B] border-b-2 border-b-[#F97316] bg-[#071A4B]/5'
                        : 'border-[#E2E8F0] bg-[#F5F7FA] hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      className="mt-1 text-[#F97316] focus:ring-[#F97316]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-extrabold text-[#071A4B] block">
                        เพิ่มข้อมูลต่อท้าย (Append)
                      </span>
                      <span className="text-[11px] text-slate-500 block leading-relaxed">
                        เก็บผลประเมินที่มีอยู่เดิมทั้งหมด และเพิ่ม/อัปเดตข้อมูลจากไฟล์นี้เข้าไป
                      </span>
                    </div>
                  </label>

                  <label
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                      importMode === 'replace'
                        ? 'border-[#F97316] border-b-2 border-b-[#F97316] bg-orange-50/70'
                        : 'border-[#E2E8F0] bg-[#F5F7FA] hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="mt-1 text-[#F97316] focus:ring-[#F97316]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-extrabold text-[#071A4B] block">
                        แทนที่ข้อมูลที่เคยนำเข้าของหลักสูตรนี้ (Replace Imported)
                      </span>
                      <span className="text-[11px] text-slate-500 block leading-relaxed">
                        ล้างเฉพาะผลประเมินที่เคยนำเข้าก่อนหน้า ({existingImportedCount} รายการ) โดยไม่ลบผลประเมินที่ผู้เรียนกรอกผ่านระบบจริง
                      </span>
                    </div>
                  </label>
                </div>

                {validation.inFileDuplicateCount > 0 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-3.5 py-2.5 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipInFileDuplicates}
                      onChange={e => setSkipInFileDuplicates(e.target.checked)}
                      className="rounded text-[#F97316] focus:ring-[#F97316]"
                    />
                    <span>
                      พบอีเมล/รหัสซ้ำกันภายในไฟล์ {validation.inFileDuplicateCount} แถว — ข้ามแถวที่ซ้ำ (เก็บเฉพาะรายการแรก)
                    </span>
                  </label>
                )}
              </div>

              {/* Step 3: Validation Summary & Preview */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                      <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#EA580C]">
                        Validation & Preview
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-[#071A4B] mt-0.5">
                      สรุปผลการตรวจสอบข้อมูลก่อนนำเข้า
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 tabular-nums">
                    <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                      พร้อมนำเข้า {rowsToWrite.length} แถว
                    </span>
                    <span className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#EA580C] text-[11px] font-bold">
                      พึงพอใจเฉลี่ย ★ {predictedImportAvg > 0 ? predictedImportAvg.toFixed(2) : '-'} / 5
                    </span>
                    {validation.invalidRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowInvalidDetails(v => !v)}
                        className="px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold hover:bg-rose-100 transition cursor-pointer"
                      >
                        ข้ามแถวไม่สมบูรณ์ {validation.invalidRows.length} แถว (ดูเหตุผล)
                      </button>
                    )}
                    {validation.existingMatchCount > 0 && (
                      <span className="px-3 py-1 rounded-full bg-slate-100 border border-[#E2E8F0] text-[#071A4B] text-[11px] font-bold">
                        ตรงกับผู้ลงทะเบียนเดิม {validation.existingMatchCount} คน
                      </span>
                    )}
                  </div>
                </div>

                {showInvalidDetails && validation.invalidRows.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-1.5 text-xs text-rose-900">
                    <p className="font-bold flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      <span>รายการแถวที่ไม่ผ่านการตรวจสอบ (ระบบจะข้ามอัตโนมัติ):</span>
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] max-h-32 overflow-y-auto">
                      {validation.invalidRows.slice(0, 20).map(inv => (
                        <li key={inv.rowIndex}>
                          แถวข้อมูลที่ {inv.rowIndex} ({inv.rawIdentifier}): {inv.reason}
                        </li>
                      ))}
                      {validation.invalidRows.length > 20 && (
                        <li className="font-bold">... และอีก {validation.invalidRows.length - 20} แถว</li>
                      )}
                    </ul>
                  </div>
                )}

                {validation.emptySkippedCount > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                    <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>ข้ามแถวว่างเปล่าท้ายตารางอัตโนมัติ {validation.emptySkippedCount} แถว</span>
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F7FA] border-b border-[#E2E8F0] text-[11px] font-bold text-[#071A4B]">
                        <th className="py-2.5 px-3 w-14 text-center">แถว</th>
                        <th className="py-2.5 px-3">ผู้ประเมิน / อีเมล</th>
                        <th className="py-2.5 px-3">สังกัด</th>
                        <th className="py-2.5 px-3 text-center">พึงพอใจ</th>
                        <th className="py-2.5 px-3 text-center">แนะนำต่อ</th>
                        <th className="py-2.5 px-3">ข้อเสนอแนะ (ตัวอย่าง)</th>
                        <th className="py-2.5 px-3 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]/70">
                      {rowsToWrite.slice(0, 8).map(row => (
                        <tr key={row.rowIndex} className="hover:bg-[#F5F7FA]">
                          <td className="py-2 px-3 text-center font-mono text-slate-400 tabular-nums">
                            {row.rowIndex}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-[#071A4B] truncate max-w-[180px]">{row.name}</div>
                            {row.rawIdentifier && (
                              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                                {row.rawIdentifier}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[150px]">{row.department}</td>
                          <td className="py-2 px-3 text-center font-extrabold text-[#EA580C] tabular-nums">
                            ★ {row.satisfaction.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-[#071A4B] tabular-nums">
                            {row.recommendation !== undefined ? row.recommendation.toFixed(2) : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-500 truncate max-w-[200px]">
                            {row.comments || '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {row.existingRegistrationId ? (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                                อัปเดตผู้ลงทะเบียน
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                นำเข้าใหม่
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {rowsToWrite.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                            ไม่มีแถวที่พร้อมนำเข้า กรุณาตรวจสอบคอลัมน์คะแนนความพึงพอใจ (1–5)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {rowsToWrite.length > 8 && (
                  <p className="text-[11px] text-slate-400 text-right tabular-nums">
                    แสดงตัวอย่าง 8 รายการแรกจากทั้งหมด {rowsToWrite.length} รายการที่จะนำเข้า
                  </p>
                )}
              </div>
            </>
          )}

          {submitError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-800">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs font-semibold leading-relaxed">{submitError}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F5F7FA] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs font-semibold text-slate-500">
            {submitting && progressText ? (
              <span className="flex items-center gap-2 text-[#071A4B] font-bold">
                <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
                {progressText}
              </span>
            ) : (
              <span>ข้อมูลจะถูกตรวจสอบและจัดเก็บเข้าสู่ฐานข้อมูลของหลักสูตรนี้โดยตรง</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2 rounded-full border border-[#E2E8F0] bg-white hover:border-[#071A4B] text-[#071A4B] text-xs font-bold transition min-h-[38px] cursor-pointer disabled:opacity-40"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={
                submitting ||
                parsing ||
                !parsedSheet ||
                !validation ||
                rowsToWrite.length === 0 ||
                mapping.ratingCols.length === 0
              }
              onClick={handleConfirmImport}
              className="px-6 py-2 rounded-full bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition flex items-center gap-2 min-h-[38px] cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>กำลังนำเข้าข้อมูล...</span>
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  <span>ยืนยันนำเข้า {rowsToWrite.length} รายการ</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
