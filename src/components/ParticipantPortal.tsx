import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, setDoc, updateDoc, 
  onSnapshot, serverTimestamp, getDoc, increment, deleteDoc, writeBatch 
} from 'firebase/firestore';
import { 
  Calendar, MapPin, User, CheckCircle2, AlertCircle, Clock, 
  ChevronRight, Star, Send, QrCode as QrIcon, Camera, Search, BookOpen, LogOut, Award,
  Mail, Check, ExternalLink, Globe, Shield, Lock, Maximize2, X, ZoomIn,
  Edit3, Save, AlertTriangle, CheckCircle, RefreshCw
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Course, Registration, Feedback, EvaluationConfig, DEFAULT_EVALUATION_CONFIG, CampaignLog, Personnel } from '../types';
import { matchPosition } from './AdminPortal';
import { sendGasWebhook } from '../services/webhookService';

const DEFAULT_REGISTER_SUBJECT = "ยืนยันการลงทะเบียนอบรม";

const DEFAULT_REGISTER_HTML = `<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <span style='font-size: 40px;'>🎉</span>
    <h2 style='color: #ea580c; margin: 10px 0 0 0; font-weight: 800;'>ยืนยันการลงทะเบียนอบรมสำเร็จ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  
  <p style='font-size: 15px; color: #334155;'>เรียน คุณ <strong>{learner_name}</strong></p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ระบบได้ดำเนินการสำรองที่นั่งสำหรับเข้าการอบรมของท่านเป็นที่เรียบร้อยแล้ว โดยมีรายละเอียดกิจกรรมดังต่อไปนี้</p>
  
  <div style='background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>📌 หลักสูตร:</strong></td><td><strong style='color: #ea580c; font-size: 14px;'>{course_title}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>📅 วันที่จัดงาน:</strong></td><td>{course_date}</td></tr>
      <tr><td style='padding: 6px 0;'><strong>⏰ เวลาจัดอบรม:</strong></td><td>{course_time} น.</td></tr>
      <tr><td style='padding: 6px 0;'><strong>📍 สถานที่อบรม:</strong></td><td>{course_location}</td></tr>
    </table>
  </div>
  
  <p style='font-size: 13px; color: #475569; line-height: 1.6; background-color: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;'>
    💡 <strong>ข้อแนะนำการบันทึกปฏิทิน:</strong> ระบบได้จัดส่งคำเชิญนัดหมายเข้าสู่ Google Calendar (@bu.ac.th) ของคุณเรียบร้อยแล้ว กรุณากดปุ่ม <strong>"ตอบรับ / เข้าร่วม (Yes/Accept)"</strong> ในคำเชิญปฏิทินที่ถูกแนบไปกับกล่องจดหมายเพื่อบันทึกกิจกรรมและตั้งระบบแจ้งเตือนล่วงหน้าโดยอัตโนมัติ
  </p>
  
  <p style='font-size: 13px; color: #64748b; text-align: center; margin-top: 20px;'>
    หากมีข้อสงสัยหรือต้องการสอบถามเพิ่มเติม สามารถติดต่อสำนักมาตรฐานคุณภาพการศึกษาได้ที่เบอร์ภายใน หรือช่องทางหลักของสำนักฯ
  </p>
  
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
  <div style='text-align: center;'>
    <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
    <p style='font-size: 10px; color: #cbd5e1; margin-top: 4px;'>BU Training Management & Personnel Service Solutions</p>
  </div>
</div>`;

const DEFAULT_CHECKIN_SUBJECT = "💜 เช็คอินเข้าเรียนสำเร็จเรียบร้อย: {course_title}";

const DEFAULT_CHECKIN_HTML = `<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <span style='font-size: 40px;'>✅</span>
    <h2 style='color: #7c3aed; margin: 10px 0 0 0; font-weight: 800;'>สแกนเช็คอินเข้าชั้นเรียนสำเร็จ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  <p style='font-size: 15px; color: #334155;'>สวัสดีคุณ <strong>{learner_name}</strong>,</p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ระบบได้รับการเช็คอินและสแกนยืนยันการเข้าร่วมงานสัมมนาอบรมของคุณเป็นที่เรียบร้อย ข้อมูลการประเมินเวลามีดังนี้:</p>
  
  <div style='background-color: #f5f3ff; border-left: 4px solid #7c3aed; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>💜 หลักสูตร:</strong></td><td><strong style='color: #7c3aed; font-size: 14px;'>{course_title}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>📅 วันที่และเวลา:</strong></td><td>{course_date} ({course_time} น.)</td></tr>
      <tr><td style='padding: 6px 0;'><strong>📍 สถานที่จัดงาน:</strong></td><td>{course_location}</td></tr>
    </table>
  </div>
  
  <p style='font-size: 13px; color: #b91c1c; line-height: 1.6; background-color: #fef2f2; padding: 12px; border-radius: 8px; border: 1px solid #fee2e2; font-weight: bold;'>
    ⚠️ ขั้นตอนถัดไป: โปรดล็อกอินเข้าสู่เว็บไซต์ระบบเพื่อตอบแบบประเมินความพึงพอใจโครงการสัมมนานี้ เพื่อรับสิทธิ์จัดพิมพ์วุฒิบัตรสะสมชั่วโมงและเป็นหลักฐานชั่วโมงงานถัดไปค่ะ
  </p>
  
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
  <div style='text-align: center;'>
    <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนแบบอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
    <p style='font-size: 10px; color: #cbd5e1; margin-top: 4px;'>BU Training Management & Personnel Service Solutions</p>
  </div>
</div>`;

interface ParticipantPortalProps {
  userEmail: string;
  userName: string;
  isAdmin?: boolean;
  onLogout: () => void;
  // Triggered if URL contained a courseId to check-in
  initialCheckInCourseId: string | null;
  clearInitialCheckIn: () => void;
  initialFeedbackCourseId?: string | null;
  clearInitialFeedback?: () => void;
  gasUrl: string;
}

export default function ParticipantPortal({ 
  userEmail, 
  userName, 
  isAdmin = false,
  onLogout,
  initialCheckInCourseId,
  clearInitialCheckIn,
  initialFeedbackCourseId,
  clearInitialFeedback,
  gasUrl
}: ParticipantPortalProps) {
  const cleanUserEmail = userEmail.trim().toLowerCase();
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [activeTab, setActiveTab] = useState<'catalog' | 'registrations' | 'qr-checkin' | 'evaluation'>('catalog');
  const [selectedPosterModal, setSelectedPosterModal] = useState<{ url: string; title: string } | null>(null);

  // Load custom templates state
  const [emailTemplates, setEmailTemplates] = useState({
    registerSubject: DEFAULT_REGISTER_SUBJECT,
    registerHtml: DEFAULT_REGISTER_HTML,
    checkinSubject: DEFAULT_CHECKIN_SUBJECT,
    checkinHtml: DEFAULT_CHECKIN_HTML,
  });
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const validRegistrations = loading 
    ? registrations 
    : registrations.filter(reg => courses.some(c => c.id === reg.courseId));
  const pendingFeedbackCount = loading
    ? 0
    : courses.filter(c => {
        const reg = validRegistrations.find(r => r.courseId === c.id);
        return reg && reg.checkedIn && !reg.feedback;
      }).length;
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryRegs, setSearchQueryRegs] = useState('');
  const [selectedQrCourseId, setSelectedQrCourseId] = useState<string>('');
  const [selectedEvalCourseId, setSelectedEvalCourseId] = useState<string>('');
  const [showCertCourse, setShowCertCourse] = useState<Course | null>(null);
  
  // Checking in and survey states
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInCourse, setCheckInCourse] = useState<Course | null>(null);
  const [manualQrText, setManualQrText] = useState('');
  const [checkInError, setCheckInError] = useState('');
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const [proceedToSurvey, setProceedToSurvey] = useState(false);
  
  // Feedback form state
  const [surveySatisfaction, setSurveySatisfaction] = useState<number | null>(null);
  const [surveyRecommendation, setSurveyRecommendation] = useState<number | null>(null);
  const [surveyComments, setSurveyComments] = useState('');
  const [hasOpenedCustomSurvey, setHasOpenedCustomSurvey] = useState(false);

  // Dynamic evaluation states loaded from db configuration
  const [evaluationConfig, setEvaluationConfig] = useState<EvaluationConfig>(DEFAULT_EVALUATION_CONFIG);
  const [affiliation, setAffiliation] = useState('');
  const [affiliationOther, setAffiliationOther] = useState('');
  const [part2Before, setPart2Before] = useState<number | null>(null);
  const [part2After, setPart2After] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});

  const targetEval = courses.find(c => c.id === selectedEvalCourseId);
  const activeEvalConfig = targetEval?.customEvaluationConfig || evaluationConfig;

  // Pre-populate evaluation ratings with 0 (unselected/no-color) stars by default to require active selection
  useEffect(() => {
    if (selectedEvalCourseId && activeEvalConfig?.part3Questions) {
      const defaultAnswers: Record<string, string | number> = {};
      activeEvalConfig.part3Questions.forEach(q => {
        if (q.type === 'rating') {
          defaultAnswers[q.id] = 0;
        } else {
          defaultAnswers[q.id] = '';
        }
      });
      setAnswers(defaultAnswers);
    } else {
      setAnswers({});
    }
  }, [selectedEvalCourseId, activeEvalConfig]);

  // Email preview states
  const [previewRegId, setPreviewRegId] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  // Current user personnel state & profile management
  const [personnelId, setPersonnelId] = useState('');
  const [profileName, setProfileName] = useState(userName);
  const [department, setDepartment] = useState(cleanUserEmail === 'panisara.l@bu.ac.th' ? 'สำนักมาตรฐานคุณภาพการศึกษา' : 'ฝ่ายทั่วไป');
  const [position, setPosition] = useState(cleanUserEmail === 'panisara.l@bu.ac.th' ? 'ผู้บริหารระบบ สำนักมาตรฐานคุณภาพการศึกษา' : '');
  const [curriculum, setCurriculum] = useState('-');
  const [academicDepartment, setAcademicDepartment] = useState('-');
  const [phone, setPhone] = useState('-');
  const [hasDbProfile, setHasDbProfile] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // Edit form state
  const [editProfileForm, setEditProfileForm] = useState({
    id: '',
    name: '',
    department: '',
    position: '',
    curriculum: '',
    academicDepartment: '',
    phone: ''
  });

  const openEditProfile = () => {
    if (!isAdmin) {
      alert('ขออภัยค่ะ ระบบจำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขข้อมูลบุคลากรได้ค่ะ');
      return;
    }
    setEditProfileForm({
      id: personnelId.startsWith('BU-8') && !hasDbProfile ? '' : personnelId,
      name: profileName || userName,
      department: department === 'ฝ่ายทั่วไป' && cleanUserEmail === 'panisara.l@bu.ac.th' ? 'สำนักมาตรฐานคุณภาพการศึกษา' : department,
      position: position === 'บุคลากรทั่วไป' ? '' : position,
      curriculum: curriculum === '-' ? '' : curriculum,
      academicDepartment: academicDepartment === '-' ? '' : academicDepartment,
      phone: phone === '-' ? '' : phone
    });
    setIsEditProfileOpen(true);
  };

  const handleSaveMyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert('ขออภัยค่ะ ระบบจำกัดสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขข้อมูลบุคลากรได้ค่ะ');
      return;
    }
    const trimmedId = editProfileForm.id.trim();
    const trimmedName = editProfileForm.name.trim();
    const trimmedDept = editProfileForm.department.trim() || 'สำนักมาตรฐานคุณภาพการศึกษา';
    const trimmedPos = editProfileForm.position.trim() || 'บุคลากรประจำ';
    const trimmedCurr = editProfileForm.curriculum.trim() || '-';
    const trimmedAcad = editProfileForm.academicDepartment.trim() || '-';
    const trimmedPhone = editProfileForm.phone.trim() || '-';

    if (!trimmedId) {
      alert('กรุณาระบุรหัสบุคลากรของท่าน (เช่น รหัสพนักงานมหาวิทยาลัยกรุงเทพ)');
      return;
    }
    if (!trimmedName) {
      alert('กรุณาระบุชื่อ-นามสกุลให้ถูกต้องค่ะ');
      return;
    }

    setSavingProfile(true);
    try {
      const newPersonnel: Personnel = {
        id: trimmedId,
        name: trimmedName,
        email: cleanUserEmail,
        department: trimmedDept,
        position: trimmedPos,
        curriculum: trimmedCurr,
        academicDepartment: trimmedAcad,
        phone: trimmedPhone,
        createdAt: new Date().toISOString()
      };

      // If had an old temporary ID, clean up the old document
      if (personnelId && personnelId !== trimmedId && (personnelId.startsWith('BU-') || personnelId.startsWith('TEMP-'))) {
        try {
          await deleteDoc(doc(db, 'personnel', personnelId));
        } catch (delErr) {
          // ignore
        }
      }

      // Save personnel to Firestore
      await setDoc(doc(db, 'personnel', trimmedId), newPersonnel);

      // Sync with user's past registrations in Firestore so certificates & reports match immediately
      const qRegs = query(collection(db, 'registrations'), where('email', '==', cleanUserEmail));
      const regSnap = await getDocs(qRegs);
      if (!regSnap.empty) {
        const batch = writeBatch(db);
        regSnap.forEach(rDoc => {
          batch.update(doc(db, 'registrations', rDoc.id), {
            personnelId: trimmedId,
            name: trimmedName,
            department: trimmedDept,
            position: trimmedPos,
            curriculum: trimmedCurr,
            academicDepartment: trimmedAcad
          });
        });
        await batch.commit();
      }

      setPersonnelId(trimmedId);
      setProfileName(trimmedName);
      setDepartment(trimmedDept);
      setPosition(trimmedPos);
      setCurriculum(trimmedCurr);
      setAcademicDepartment(trimmedAcad);
      setPhone(trimmedPhone);
      setHasDbProfile(true);
      setIsEditProfileOpen(false);
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 6000);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (err.message || String(err)));
    } finally {
      setSavingProfile(false);
    }
  };

  const [campaignLogs, setCampaignLogs] = useState<CampaignLog[]>([]);

  // Check if user is invited to a course
  const isUserInvitedToCourse = (courseId: string, email: string): boolean => {
    if (!courseId || !email) return false;

    // If the URL has a courseId param matching this course, they received the email link, so they are invited!
    const params = new URLSearchParams(window.location.search);
    const urlCourseId = params.get('courseId') || params.get('courseid');
    if (urlCourseId && urlCourseId.trim().toUpperCase() === courseId.trim().toUpperCase()) {
      return true;
    }

    const cleanCourseId = courseId.trim().toUpperCase();
    const courseLogs = campaignLogs.filter(log => log.courseId && log.courseId.trim().toUpperCase() === cleanCourseId);
    if (courseLogs.length === 0) return false;

    const lowerEmail = email.toLowerCase().trim();
    return courseLogs.some(log => {
      if (!log.logs || log.logs.length === 0) return false;
      return log.logs.some(line => line && line.toLowerCase().includes(lowerEmail));
    });
  };

  // Course qualification / position eligibility checker
  const isUserEligibleForCourse = (userPosition: string, userId: string, targetPositions?: string[], targetPersonnelIds?: string[]): boolean => {
    const hasPositions = targetPositions && targetPositions.length > 0;
    const hasPersonnel = targetPersonnelIds && targetPersonnelIds.length > 0;
    if (!hasPositions && !hasPersonnel) return true;

    const isPositionMatched = hasPositions && targetPositions.some(target => matchPosition(userPosition, target));
    const isUserMatched = hasPersonnel && targetPersonnelIds.includes(userId);

    return isPositionMatched || isUserMatched;
  };

  // Load email templates with auto-migration
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'email_templates'), async (snap) => {
      let rSub = DEFAULT_REGISTER_SUBJECT;
      let rHtml = DEFAULT_REGISTER_HTML;
      let cSub = DEFAULT_CHECKIN_SUBJECT;
      let cHtml = DEFAULT_CHECKIN_HTML;

      if (snap.exists()) {
        const tData = snap.data();
        rSub = tData.registerSubject || DEFAULT_REGISTER_SUBJECT;
        rHtml = tData.registerHtml || DEFAULT_REGISTER_HTML;
        cSub = tData.checkinSubject || DEFAULT_CHECKIN_SUBJECT;
        cHtml = tData.checkinHtml || DEFAULT_CHECKIN_HTML;

        // Auto-migrate if database contains old default values (specifically for registering)
        const isOldSubject = rSub === "ยืนยันการลงทะเบียนเข้าอบรม: {course_title}" || 
                             rSub.startsWith("✨ ยืนยันการลงทะเบียนสัมมนากรณีพิเศษสำเร็จ") ||
                             rSub.startsWith("[SUCCESS] ยืนยันการลงทะเบียนสัมมนากรณีพิเศษสำเร็จ");
                             
        const isOldHtml = rHtml.includes("ระบบได้ทำรายการลงทะเบียนสำหรับท่านเรียบร้อยแล้วค่ะ") || 
                           rHtml.includes("หลักสูตรอบรมพัฒนาสถาบันคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ") || 
                           rHtml.includes("ระบบได้ทำรายการสำรองที่นั่งสัมมนาสำหรับคุณเรียบร้อยแล้วค่ะ") ||
                           rHtml.includes("สำรองที่นั่ง/ลงทะเบียนสำเร็จ") ||
                           !rHtml.includes("ยืนยันการลงทะเบียนอบรมสำเร็จ");

        if (isOldSubject || isOldHtml) {
          console.log("[Auto-Migration Participant] Migrating email templates to the latest version requested by the user...");
          try {
            const newSubject = isOldSubject ? DEFAULT_REGISTER_SUBJECT : rSub;
            const newHtml = isOldHtml ? DEFAULT_REGISTER_HTML : rHtml;
            
            await setDoc(doc(db, 'settings', 'email_templates'), {
              registerSubject: newSubject,
              registerHtml: newHtml,
              checkinSubject: cSub,
              checkinHtml: cHtml,
              updatedAt: new Date().toISOString()
            }, { merge: true });
            
            console.log("[Auto-Migration Participant] Successfully updated email templates in Firestore!");
            setEmailTemplates({
              registerSubject: newSubject,
              registerHtml: newHtml,
              checkinSubject: cSub,
              checkinHtml: cHtml
            });
            return;
          } catch (e) {
            console.error("[Auto-Migration Participant] Failed to migrate templates in Firestore:", e);
          }
        }
      } else {
        // Initialize default templates in database if not present
        try {
          await setDoc(doc(db, 'settings', 'email_templates'), {
            registerSubject: rSub,
            registerHtml: rHtml,
            checkinSubject: cSub,
            checkinHtml: cHtml,
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.error("Failed to initialize empty email templates:", e);
        }
      }

      setEmailTemplates({
        registerSubject: rSub,
        registerHtml: rHtml,
        checkinSubject: cSub,
        checkinHtml: cHtml
      });
    });
    return unsub;
  }, []);

  // Load dynamic survey evaluation config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'evaluation_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as EvaluationConfig;
        setEvaluationConfig({
          part1Affiliations: data.part1Affiliations || DEFAULT_EVALUATION_CONFIG.part1Affiliations,
          enableOtherAffiliation: data.enableOtherAffiliation !== undefined ? data.enableOtherAffiliation : DEFAULT_EVALUATION_CONFIG.enableOtherAffiliation,
          part2BeforeLabel: data.part2BeforeLabel || DEFAULT_EVALUATION_CONFIG.part2BeforeLabel,
          part2AfterLabel: data.part2AfterLabel || DEFAULT_EVALUATION_CONFIG.part2AfterLabel,
          part3Questions: data.part3Questions || DEFAULT_EVALUATION_CONFIG.part3Questions
        });
      } else {
        setEvaluationConfig(DEFAULT_EVALUATION_CONFIG);
      }
    });
    return unsub;
  }, []);

  // Format email payload replacing dynamic tokens
  const formatEmailPayload = (action: 'register' | 'checkin', course: Course, name: string, email: string) => {
    const subjectTemplate = action === 'register' 
      ? emailTemplates.registerSubject 
      : emailTemplates.checkinSubject;
    const htmlTemplate = action === 'register' 
      ? emailTemplates.registerHtml 
      : emailTemplates.checkinHtml;

    const getCleanOrigin = () => {
      let origin = window.location.origin;
      origin = origin.replace(/\.run\.app\./gi, '.run.app');
      if (origin.endsWith('/')) {
        origin = origin.slice(0, -1);
      }
      return origin;
    };

    const getPosterAttachmentData = (url: string) => {
      if (url && url.startsWith('data:image/')) {
        const parts = url.split(',');
        if (parts.length === 2) {
          const header = parts[0];
          const base64 = parts[1];
          const mimeMatch = header.match(/data:(image\/[^;]+);base64/);
          if (mimeMatch) {
            return {
              inlinePosterBase64: base64,
              inlinePosterContentType: mimeMatch[1]
            };
          }
        }
      }
      return null;
    };

    const replaceTokens = (text: string) => {
      if (!text) return '';
      const regLink = `${getCleanOrigin()}/?courseId=${course.id}`;
      const surveyLink = `${getCleanOrigin()}/?courseId=${course.id}&action=feedback&learner=${encodeURIComponent(email)}`;
      const posterUrl = course.posterUrl || '';
      
      let posterHtml = '';
      if (posterUrl) {
        posterHtml = `
          <div style="text-align: center; margin: 20px 0;">
            <img src="${posterUrl}" alt="${course.title}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" />
          </div>
        `;
      }

      return text
        .replace(/{learner_name}/g, name)
        .replace(/{course_title}/g, course.title)
        .replace(/{course_date}/g, course.date)
        .replace(/{course_time}/g, course.time)
        .replace(/{course_location}/g, course.location)
        .replace(/{course_description}/g, course.description || '')
        .replace(/{register_link}/g, regLink)
        .replace(/{survey_link}/g, surveyLink)
        .replace(/{course_poster_url}/g, posterUrl)
        .replace(/{course_poster_html}/g, posterHtml)
        .replace(/{course_poster}/g, posterHtml);
    };

    const posterAttach = getPosterAttachmentData(course.posterUrl || '');
    let finalHtml = replaceTokens(htmlTemplate);
    if (posterAttach && course.posterUrl) {
      finalHtml = finalHtml.split(course.posterUrl).join('cid:course_poster_cid');
    }

    return {
      action,
      email,
      name,
      courseTitle: course.title,
      date: course.date,
      time: course.time,
      location: course.location,
      subject: replaceTokens(subjectTemplate),
      htmlBody: finalHtml,
      ...(posterAttach ? {
        inlinePosterBase64: posterAttach.inlinePosterBase64,
        inlinePosterContentType: posterAttach.inlinePosterContentType
      } : {})
    };
  };

  // Load personnel info from Firestore in real-time with case-insensitive matching
  useEffect(() => {
    if (!cleanUserEmail) return;

    const unsubscribe = onSnapshot(collection(db, 'personnel'), (snap) => {
      const list: Personnel[] = [];
      snap.forEach(doc => {
        list.push(doc.data() as Personnel);
      });

      // Match current user case-insensitively by email
      const matched = list.find(p => p.email && p.email.trim().toLowerCase() === cleanUserEmail);

      if (matched) {
        setPersonnelId(matched.id || '');
        setProfileName(matched.name || userName);
        setDepartment(matched.department || (cleanUserEmail === 'panisara.l@bu.ac.th' ? 'สำนักมาตรฐานคุณภาพการศึกษา' : 'สำนักวิทยาการ'));
        setPosition(matched.position || (cleanUserEmail === 'panisara.l@bu.ac.th' ? 'ผู้บริหารระบบ สำนักมาตรฐานคุณภาพการศึกษา' : ''));
        setCurriculum(matched.curriculum || '-');
        setAcademicDepartment(matched.academicDepartment || '-');
        setPhone(matched.phone || '-');
        setHasDbProfile(true);
      } else {
        setHasDbProfile(false);
        if (cleanUserEmail === 'panisara.l@bu.ac.th') {
          setPersonnelId(prev => (prev && !prev.startsWith('BU-8') ? prev : 'BUQA-001'));
          setProfileName(userName || 'ปณิสรา ลี้สา');
          setDepartment('สำนักมาตรฐานคุณภาพการศึกษา');
          setPosition('ผู้บริหารระบบ สำนักมาตรฐานคุณภาพการศึกษา');
        } else {
          setPersonnelId(prev => {
            if (prev && !prev.startsWith('TEMP-') && !prev.startsWith('BU-')) return prev;
            return prev || ('BU-' + Math.floor(100000 + Math.random() * 900000));
          });
          setPosition('');
        }
      }
    }, (err) => {
      console.error('Error fetching personnel info:', err);
    });

    return () => unsubscribe();
  }, [cleanUserEmail, userName]);

  // Load Courses Real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'courses'), (snap) => {
      const data: Course[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as Course);
      });
      // Sort: nearest dynamic date
      data.sort((a,b) => b.date.localeCompare(a.date));
      setCourses(data);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'courses');
    });
    return unsub;
  }, []);

  // Load Registrations Real-time for logged-in user
  useEffect(() => {
    if (!cleanUserEmail) return;
    const unsub = onSnapshot(
      query(collection(db, 'registrations'), where('email', '==', cleanUserEmail)),
      (snap) => {
        const data: Registration[] = [];
        snap.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() } as Registration);
        });
        setRegistrations(data);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'registrations');
      }
    );
    return unsub;
  }, [cleanUserEmail]);

  // Load Campaign Logs Real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'campaign_logs'), (snap) => {
      const data: CampaignLog[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as CampaignLog);
      });
      setCampaignLogs(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'campaign_logs');
    });
    return unsub;
  }, []);

  // Submits the check-in and instantly sends GAS notification (re-usable for auto check-in)
  const performDirectCheckIn = async (targetCourse: Course) => {
    setSubmitting(true);
    setCheckInError('');

    // Check if user is already registered. If registered, we bypass the invitation check.
    const isRegistered = registrations.some(r => r.courseId === targetCourse.id);

    if (targetCourse.restrictToTargets === true && !isRegistered && !isUserInvitedToCourse(targetCourse.id, cleanUserEmail)) {
      setCheckInError('ขออภัยค่ะ โครงการอบรมนี้อนุญาตให้ลงทะเบียนและเข้าอบรมได้เฉพาะผู้ที่ได้รับอีเมลเชิญเท่านั้น');
      setSubmitting(false);
      return;
    }

    const id = `${targetCourse.id}_${cleanUserEmail.replace(/\./g, '_')}`;
    
    try {
      const docRef = doc(db, 'registrations', id);
      const docSnap = await getDoc(docRef);
      
      const payload: Partial<Registration> = {
        checkedIn: true,
        checkedInAt: new Date().toISOString()
      };

      if (!docSnap.exists()) {
        const newReg: Registration = {
          id,
          courseId: targetCourse.id,
          email: cleanUserEmail,
          personnelId: personnelId || 'TEMP-' + Math.floor(1000 + Math.random()*9000),
          name: userName,
          department,
          registeredAt: new Date().toISOString(),
          checkedIn: true,
          checkedInAt: new Date().toISOString()
        };
        await setDoc(docRef, newReg);
        await updateDoc(doc(db, 'courses', targetCourse.id), {
          registeredCount: increment(1)
        });
      } else {
        await updateDoc(docRef, payload);
      }

      setCheckInSuccess(true);
      setProceedToSurvey(false);

      // --- Google Apps Script Webhook ---
      const emailPayload = formatEmailPayload('checkin', targetCourse, userName, cleanUserEmail);

      if (gasUrl) {
        try {
          await sendGasWebhook(gasUrl, emailPayload);
          console.log('Automated Webhook submitted to Gas successfully.');
        } catch (gasErr: any) {
          console.error('GAS connection failed:', gasErr);
          alert(`⚠️ เช็คอินในระบบสำเร็จแล้ว แต่การจัดส่งอีเมลยืนยันขัดข้อง:\n${gasErr.message || gasErr}`);
        }
      } else {
        console.warn('--- EMAIL SIMULATION (No GAS App URL provided) ---');
        console.warn(`Sent confirmation to ${cleanUserEmail} for "${targetCourse.title}"`);
      }
    } catch (err) {
      console.error(err);
      setCheckInError('เช็คอินล้มเหลว โปรดตรวจสอบสิทธิ์การสื่อสารข้อมูล');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle URL Redirect QR Checks
  useEffect(() => {
    if (initialCheckInCourseId) {
      if (courses.length > 0) {
        const target = courses.find(
          c => c.id.trim().toUpperCase() === initialCheckInCourseId.trim().toUpperCase()
        );
        if (target) {
          // Open check-in immediately
          setCheckInCourse(target);
          setSelectedQrCourseId(target.id);
          setActiveTab('qr-checkin');
          setShowCheckInModal(true);
          clearInitialCheckIn();
          
          // Execute instant check-in automatically!
          performDirectCheckIn(target);
        } else {
          setSelectedQrCourseId(initialCheckInCourseId);
          setActiveTab('qr-checkin');
        }
      } else {
        setSelectedQrCourseId(initialCheckInCourseId);
        setActiveTab('qr-checkin');
      }
    }
  }, [initialCheckInCourseId, courses]);

  // Handle URL Redirect Feedback Checks
  useEffect(() => {
    if (initialFeedbackCourseId) {
      if (courses.length > 0) {
        const target = courses.find(
          c => c.id.trim().toUpperCase() === initialFeedbackCourseId.trim().toUpperCase()
        );
        if (target) {
          // Go to evaluation tab and select this course with exact Firestore casing
          setSelectedEvalCourseId(target.id);
          setActiveTab('evaluation');
          if (clearInitialFeedback) {
            clearInitialFeedback();
          }
        } else {
          setSelectedEvalCourseId(initialFeedbackCourseId);
          setActiveTab('evaluation');
        }
      } else {
        setSelectedEvalCourseId(initialFeedbackCourseId);
        setActiveTab('evaluation');
      }
    }
  }, [initialFeedbackCourseId, courses]);

  // Registers for a training seat
  const handleRegister = async (course: Course) => {
    if (!personnelId) {
      alert('กรุณากรอกรหัสบุคลากรของท่านก่อนทำการลงทะเบียน');
      return;
    }

    if (course.restrictToTargets === true) {
      if (!isUserInvitedToCourse(course.id, cleanUserEmail)) {
        alert(`ขออภัยค่ะ โครงการอบรม "${course.title}" นี้เปิดให้ลงทะเบียนเฉพาะผู้ที่ได้รับอีเมลเชิญเข้าร่วมการอบรมผ่านระบบเท่านั้นค่ะ`);
        return;
      }
    }

    if (course.registrationCloseTime && new Date() > new Date(course.registrationCloseTime)) {
      alert('ขออภัย ระบบได้ปิดรับการลงทะเบียนสำหรับโครงการนี้เรียบร้อยแล้ว');
      return;
    }

    if (course.restrictToTargets === true) {
      if ((course.targetPositions && course.targetPositions.length > 0) || (course.targetPersonnelIds && course.targetPersonnelIds.length > 0)) {
        if (!isUserEligibleForCourse(position, personnelId, course.targetPositions, course.targetPersonnelIds)) {
          alert(`ขออภัย โครงการอบรมนี้จำกัดสิทธิ์เฉพาะกลุ่มเป้าหมายหรือรายชื่อบุคคลที่กำหนดเท่านั้น\n\nตำแหน่งปัจจุบันของคุณคือ: "${position || 'ทั่วไป (ยังไม่ระบุในระบบ)'}" รหัสบุคลากร: "${personnelId}" ซึ่งไม่ตรงกับสิทธิ์ที่กำหนด\n\nหากข้อมูลของท่านไม่ถูกต้อง กรุณาติดต่อหน่วยงาน HR / สำนักพัฒนาการเรียนรู้ค่ะ`);
          return;
        }
      }
    }
    
    setSubmitting(true);

    // Live safety check: fetch the freshest database course details to prevent race conditions
    try {
      const courseSnap = await getDoc(doc(db, 'courses', course.id));
      if (courseSnap.exists()) {
        const latestCourse = courseSnap.data() as Course;
        if (latestCourse.maxSeats && latestCourse.maxSeats > 0) {
          if ((latestCourse.registeredCount || 0) >= latestCourse.maxSeats) {
            alert(`ขออภัยสมัครไม่สำเร็จ: เนื่องจากโครงการอบรมนี้มีผู้ลงทะเบียนเต็มจำนวนที่นั่งเรียบร้อยแล้ว (${latestCourse.maxSeats} ที่นั่ง) ขอขอบพระคุณที่ให้ความสนใจค่ะ`);
            setSubmitting(false);
            return;
          }
        }
      }
    } catch (err) {
      console.error("Error verifying seats:", err);
    }

    const id = `${course.id}_${cleanUserEmail.replace(/\./g, '_')}`;
    const newReg: Registration = {
      id,
      courseId: course.id,
      email: cleanUserEmail,
      personnelId,
      name: profileName || userName,
      position: position || '-',
      department,
      curriculum: curriculum || '-',
      academicDepartment: academicDepartment || '-',
      registeredAt: new Date().toISOString(),
      checkedIn: false
    };

    try {
      await setDoc(doc(db, 'registrations', id), newReg);
      // Increment course registration count
      await updateDoc(doc(db, 'courses', course.id), {
        registeredCount: increment(1)
      });

      // --- Google Apps Script Automated Registration & Calendar Invite ---
      const emailPayload = formatEmailPayload('register', course, userName, cleanUserEmail);

      if (gasUrl) {
        try {
          await sendGasWebhook(gasUrl, emailPayload);
          alert(`ลงทะเบียนสำเร็จ: ${course.title} 🎉\nระบบได้ทำการส่งอีเมลแจ้งยืนยันการเข้าร่วมอบรม และส่งคำเชิญลง Google Calendar ให้ท่านเรียบร้อยแล้วค่ะ`);
        } catch (gasErr: any) {
          console.error('GAS registration hook connection failed:', gasErr);
          alert(`ลงทะเบียนสำเร็จ: ${course.title} 🎉\n\n⚠️ คำเตือนการจัดส่งอีเมล:\nระบบบันทึกการลงทะเบียนเรียบร้อยแล้ว แต่ไม่สามารถจัดส่งอีเมลยืนยันและปฏิทินได้ (${gasErr.message || 'โปรดตรวจสอบโควต้าอีเมลของระบบ'})`);
        }
      } else {
        // Simulation log for debugging
        console.warn('--- REGISTRATION EMAIL & CALENDAR SIMULATION (No GAS App URL provided) ---');
        console.warn(`Sent registration confirmation and Google Calendar invitation to ${cleanUserEmail} for "${course.title}"`);
        alert(`ลงทะเบียนสำเร็จ: ${course.title} 🎉\n[โหมดทดลองจำลอง] ระบบได้จำลองการส่งข้อมูลส่งอีเมลยืนยันปฏิทินและคำเชิญลง Google Calendar ให้ท่านเรียบร้อยแล้วค่ะ (สามารถตรวจสอบรูปเล่มอีเมลได้จากตารางประวัติการอบรมของคุณ)`);
      }

      setSelectedCourse(null);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  // Check if check-in is valid in terms of Time-based locks
  const validateTimeBasedCheckIn = (course: Course): { valid: boolean; reason?: string } => {
    // ผู้ใช้สแกน QR Code แล้ว ระบบจะอนุญาตการสแกนเช็คอินโดยตรงเสมอ (Bypass restrictions as physical display/sharing of QR code implies authorization)
    return { valid: true };
  };

  // Submits the check-in and instantly sends GAS notification
  const handleConfirmCheckIn = async () => {
    if (!checkInCourse) return;
    await performDirectCheckIn(checkInCourse);
  };

  // Submit Feedback survey 
  const handleSubmitFeedback = async () => {
    if (!checkInCourse) return;
    if (surveySatisfaction === null || surveyRecommendation === null) {
      alert('กรุณาเลือกประเมินดาวความพึงพอใจและการแนะนำหลักสูตรให้ครบถ้วนก่อนส่งค่ะ');
      return;
    }
    setSubmitting(true);
    
    const id = `${checkInCourse.id}_${cleanUserEmail.replace(/\./g, '_')}`;
    const feedback: Feedback = {
      satisfaction: surveySatisfaction,
      recommendation: surveyRecommendation,
      comments: surveyComments,
      submittedAt: new Date().toISOString()
    };

    try {
      await updateDoc(doc(db, 'registrations', id), {
        feedback
      });
      alert('ส่งผลประเมินความพึงพอใจสำเร็จเรียบร้อยแล้ว ขอบพระคุณสำหรับความคิดเห็นค่ะ 🙏');
      setShowCheckInModal(false);
      setCheckInCourse(null);
      setCheckInSuccess(false);
      setProceedToSurvey(false);
      // Reset survey form states
      setSurveySatisfaction(null);
      setSurveyRecommendation(null);
      setSurveyComments('');
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถอัปเดตแบบประเมินได้ โปรดลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter Catalog
  const filteredCourses = courses.filter(c => 
    c.visible !== false && 
    c.archived !== true && (
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.speaker.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4" id="participant-portal">
      {/* Header Info */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-8" id="portal-header">
        <div>
          <span className="text-xs font-semibold bg-orange-100 text-orange-850 px-3 py-1 rounded-full uppercase tracking-wider font-sans">
            อาจารย์และบุคลากร
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">
            ระบบบริหารจัดการการอบรมสำนักมาตรฐานคุณภาพการศึกษา
          </h1>
          <p className="text-slate-400 text-xs mt-1 font-semibold" id="user-display-meta">
            เพื่อยกระดับและขับเคลื่อนการประกันคุณภาพตามเกณฑ์ EdPEx และ AUN-QA version 4.0
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg text-sm transition duration-150 relative min-h-[44px] font-bold"
            id="btn-portal-logout"
          >
            <LogOut className="h-4 w-4" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </header>

      {/* INSTRUCTOR PROFILE CARD - WITH INTERACTIVE EDITING & DATA VERIFICATION */}
      <div className="bg-white border border-slate-150 rounded-[2rem] p-6 shadow-sm mb-8 relative overflow-hidden" id="instructor-profile-card">
        {/* Header with Title and Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3.5 flex items-center justify-center text-orange-600 w-14 h-14 shrink-0 shadow-xs">
              <User className="h-7 w-7 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-850 tracking-tight font-sans">
                  ข้อมูลโปรไฟล์บุคลากร
                </h2>
                {hasDbProfile ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-extrabold text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>VERIFIED PROFILE</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 font-extrabold text-[10px] uppercase tracking-wider bg-amber-50 border border-amber-200/70 px-2.5 py-0.5 rounded-full">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    <span>UNSYNCED</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                ข้อมูลส่วนบุคคลสำหรับใช้ในการลงทะเบียน ออกใบวุฒิบัตร และจัดทำสถิติรายงานการอบรม
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={openEditProfile}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition duration-150 cursor-pointer shrink-0"
              id="btn-open-edit-profile"
              title="แก้ไขรหัสบุคลากร ชื่อ-นามสกุล ตำแหน่ง หรือหน่วยงาน (เฉพาะผู้ดูแลระบบ)"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>แก้ไขข้อมูลบุคลากร (เฉพาะแอดมิน)</span>
            </button>
          )}
        </div>

        {/* 6 Grid Field Displays */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
              💳 รหัสบุคลากร
            </label>
            <div className="w-full bg-slate-50 border border-slate-150 px-4 py-3 rounded-xl text-slate-800 font-extrabold text-sm tracking-wide flex items-center justify-between">
              <span>{personnelId || 'ยังไม่ได้ระบุ'}</span>
              {!hasDbProfile && personnelId.startsWith('BU-8') && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">ชั่วคราว</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
              👤 ชื่อ-นามสกุล
            </label>
            <div className="w-full bg-slate-50 border border-slate-150 px-4 py-3 rounded-xl text-slate-800 font-extrabold text-sm">
              {profileName || userName}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
              ✉️ อีเมล์มหาวิทยาลัย
            </label>
            <div className="w-full bg-slate-50 border border-slate-150 px-4 py-3 rounded-xl text-slate-800 font-bold text-sm font-mono truncate">
              {userEmail}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
              🏢 หน่วยงาน / คณะ
            </label>
            <div className="w-full bg-slate-50 border border-slate-150 px-4 py-3 rounded-xl text-slate-800 font-extrabold text-sm truncate">
              {department || 'สำนักมาตรฐานคุณภาพการศึกษา'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
              💼 ตำแหน่งงานประจำ
            </label>
            <div className="w-full bg-slate-50 border border-slate-150 px-4 py-3 rounded-xl text-slate-800 font-extrabold text-sm truncate">
              {position || 'บุคลากรทั่วไป'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">
              🎓 หลักสูตร / ภาควิชา
            </label>
            <div className="w-full bg-slate-50 border border-slate-150 px-4 py-3 rounded-xl text-slate-800 font-medium text-sm truncate">
              {curriculum && curriculum !== '-' ? curriculum : (academicDepartment && academicDepartment !== '-' ? academicDepartment : '-')}
            </div>
          </div>
        </div>

        {/* Save Success Alert Banner */}
        {profileSaveSuccess && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="font-bold">
              ✅ บันทึกข้อมูลและซิงค์กับฐานข้อมูลบุคลากรเรียบร้อยแล้วค่ะ ข้อมูลในประวัติการลงทะเบียนและใบวุฒิบัตรได้รับการอัปเดตตรงกันแล้ว
            </div>
          </div>
        )}

        {/* Dynamic Status / Action Guidance Banner */}
        {hasDbProfile ? (
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-800">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>ข้อมูลโปรไฟล์ของท่านได้รับการยืนยันและซิงค์กับฐานข้อมูลบุคลากรมหาวิทยาลัยกรุงเทพเรียบร้อยแล้ว</span>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={openEditProfile}
                className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 shrink-0 cursor-pointer"
              >
                แก้ไขข้อมูลเพิ่มเติม (เฉพาะแอดมิน)
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium">
                (ระบบจำกัดสิทธิ์เฉพาะแอดมินในการแก้ไขข้อมูล)
              </span>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-amber-900 font-bold leading-relaxed">
                  * ข้อมูลโปรไฟล์ถูกซิงค์จากฐานข้อมูลบุคลากรทางการ
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  หากข้อมูลของท่านไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ (Admin) หรือสำนักมาตรฐานคุณภาพการศึกษา เพื่อดำเนินการปรับปรุงข้อมูลในฐานระบบ (ระบบอนุญาตให้เฉพาะแอดมินแก้ไขข้อมูล)
                </p>
              </div>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={openEditProfile}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition duration-150 shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>แก้ไขข้อมูล (เฉพาะแอดมิน)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap border-b border-slate-200 mb-8 gap-2" id="portal-tabs">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-5 py-3 font-extrabold text-sm transition relative min-h-[44px] ${
            activeTab === 'catalog'
              ? 'text-orange-600 border-b-2 border-orange-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-catalog"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>หลักสูตรการอบรมทั้งหมด ({courses.length})</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('registrations')}
          className={`px-5 py-3 font-extrabold text-sm transition relative min-h-[44px] ${
            activeTab === 'registrations'
              ? 'text-orange-600 border-b-2 border-orange-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-registrations"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>ตรวจสอบสถานะการอบรมของฉัน ({validRegistrations.length})</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('evaluation')}
          className={`px-5 py-3 font-extrabold text-sm transition relative min-h-[44px] ${
            activeTab === 'evaluation'
              ? 'text-orange-600 border-b-2 border-orange-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          id="tab-evaluation"
        >
          <div className="flex items-center gap-2">
            <Star className={`h-4 w-4 ${activeTab === 'evaluation' ? 'fill-orange-600 text-orange-600' : 'text-slate-500'}`} />
            <span>ทำแบบประเมินความพึงพอใจ ({pendingFeedbackCount})</span>
          </div>
        </button>
      </div>

      {/* TABS CONTAINER */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">กำลังโหลดคำสั่งข้อมูล...</div>
      ) : activeTab === 'catalog' ? (
        /* CATALOG TAB */
        <div>
          {/* Search bar */}
          <div className="relative mb-6" id="search-section">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาตามชื่อกิจกรรมการเตรียมตัวอบรม, วิทยากร..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-800 py-3.5 pl-11 pr-4 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition shadow-sm"
              id="input-catalog-search"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="course-list-grid">
            {filteredCourses.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl">
                ไม่พบโครงการอบรมสัมมนารองรับคำค้นหาของท่าน
              </div>
            ) : (
              filteredCourses.map((course) => {
                const isRegistered = validRegistrations.some(r => r.courseId === course.id);
                const regInfo = validRegistrations.find(r => r.courseId === course.id);
                const isRegClosed = course.registrationCloseTime ? (new Date() > new Date(course.registrationCloseTime)) : false;
                const isFull = course.maxSeats ? ((course.registeredCount || 0) >= course.maxSeats) : false;
                
                return (
                  <div key={course.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md hover:border-slate-200/80 transition-all duration-200" id={`card-course-${course.id}`}>
                     <div>
                      {/* Banner Poster */}
                      <div 
                        className="relative aspect-[4/5] sm:aspect-[3/4] w-full bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100 cursor-pointer group select-none"
                        onClick={() => {
                          if (course.posterUrl) {
                            setSelectedPosterModal({ url: course.posterUrl, title: course.title });
                          }
                        }}
                        title={course.posterUrl ? "คลิกเพื่อดูรูปภาพโปสเตอร์ขนาดเต็ม" : undefined}
                        id={`banner-poster-${course.id}`}
                      >
                        {course.posterUrl ? (
                          <>
                            <img 
                              src={course.posterUrl} 
                              alt={course.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-3 pointer-events-none">
                              <span className="text-[11px] font-bold text-white bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                                <Maximize2 className="h-3 w-3" />
                                <span>ดูภาพโปสเตอร์เต็ม</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-6">
                            <span className="font-bold text-orange-800 bg-orange-100 px-3 py-1 rounded text-xs">BU TRAINING</span>
                            <p className="font-extrabold text-slate-700 text-lg mt-2 truncate max-w-[200px]">{course.title}</p>
                          </div>
                        )}
                      </div>

                      {/* Info body */}
                      <div className="p-5">
                        <h3 className="font-bold text-slate-900 tracking-tight leading-snug mb-3 text-base md:text-lg" id={`title-course-${course.id}`}>
                          {course.title}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          <span>วิทยากร: <strong>{course.speaker}</strong></span>
                        </p>

                        <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                          <p className="flex items-center gap-2">
                             <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span>{course.date} • {course.time} น.</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            <span className="truncate">{course.location}</span>
                          </p>
                          <p className="flex items-center gap-2 text-slate-500">
                             <User className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              ลงทะเบียนแล้ว: <strong className="text-orange-700">{course.registeredCount || 0}</strong>
                              {course.maxSeats ? (
                                <> / <strong className="text-slate-700">{course.maxSeats}</strong></>
                              ) : ''} คน
                              {isFull ? (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100 animate-pulse">เต็มแล้ว</span>
                              ) : ''}
                            </span>
                          </p>

                          {course.restrictToTargets === true && (course.targetPositions && course.targetPositions.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {course.targetPositions.map((pos) => (
                                <span key={pos} className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-violet-100">
                                  🎯 {pos}
                                </span>
                              ))}
                            </div>
                          )}

                          {course.registrationCloseTime && (
                            <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3 text-amber-500 animate-pulse" />
                              <span>ปิดลงทะเบียน: {new Date(course.registrationCloseTime).toLocaleString('th-TH')}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                      <div className="p-5 pt-0">
                        {isRegistered ? (
                          <div className="pt-3 border-t border-slate-50 flex items-center justify-between" id={`actions-reg-${course.id}`}>
                            {regInfo?.checkedIn ? (
                              <button
                                onClick={() => {
                                  setShowCertCourse(course);
                                }}
                                className="w-full bg-slate-900 hover:bg-black text-white font-extrabold py-3 px-4 rounded-xl text-xs transition duration-150 shadow-sm flex items-center justify-center gap-1.5 relative min-h-[44px]"
                                id={`btn-complete-feedback-${course.id}`}
                              >
                                <Award className="h-4 w-4 text-amber-400 fill-amber-400/20" />
                                <span>เข้าเรียนสำเร็จแล้ว • ดูวุฒิบัตร 🎓</span>
                              </button>
                            ) : (
                              <div className="w-full pt-2">
                                <div className="text-center text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-100 py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  <span>ลงทะเบียนสำเร็จแล้ว</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : isRegClosed ? (
                          <button
                            disabled={true}
                            className="w-full mt-3 bg-slate-100 border border-slate-200 text-slate-400 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 min-h-[44px]"
                            id={`btn-enroll-closed-${course.id}`}
                          >
                            <AlertCircle className="h-4 w-4 text-slate-400 animate-pulse" />
                            <span>ปิดรับลงทะเบียนแล้ว (Closed)</span>
                          </button>
                        ) : isFull ? (
                          <button
                            disabled={true}
                            className="w-full mt-3 bg-rose-50 border border-rose-100 text-rose-600 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 min-h-[44px]"
                            id={`btn-enroll-full-${course.id}`}
                          >
                            <AlertCircle className="h-4 w-4 text-rose-500 animate-pulse" />
                            <span>ขออภัย จำนวนที่นั่งเต็มแล้ว (Fully Booked)</span>
                          </button>
                        ) : course.restrictToTargets === true && ((course.targetPositions && course.targetPositions.length > 0) || (course.targetPersonnelIds && course.targetPersonnelIds.length > 0)) && !isUserEligibleForCourse(position, personnelId, course.targetPositions, course.targetPersonnelIds) ? (
                          <button
                            disabled={true}
                            className="w-full mt-3 bg-slate-50 border border-slate-200/60 text-slate-400 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 min-h-[44px]"
                            id={`btn-enroll-restricted-${course.id}`}
                          >
                            <AlertCircle className="h-4 w-4 text-rose-450 animate-pulse" />
                            <span>เฉพาะกลุ่มเป้าหมาย / บุคคลที่กำหนด</span>
                          </button>
                        ) : course.restrictToTargets === true && !isUserInvitedToCourse(course.id, cleanUserEmail) ? (
                          <button
                            disabled={true}
                            className="w-full mt-3 bg-slate-50 border border-slate-200 text-slate-400 font-bold py-3 px-4 rounded-xl text-[11px] flex items-center justify-center gap-1.5 min-h-[44px]"
                            id={`btn-enroll-uninvited-${course.id}`}
                          >
                            <Mail className="h-4 w-4 text-slate-400" />
                            <span>ลงนอกเหนือจากที่ส่งเมลเชิญไม่ได้</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRegister(course)}
                            disabled={submitting}
                            className="w-full mt-3 bg-orange-50 border border-orange-100 text-orange-700 hover:bg-orange-100 disabled:opacity-50 font-bold py-3 px-4 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1 relative min-h-[44px]"
                            id={`btn-enroll-${course.id}`}
                          >
                            <span>สำรองที่นั่งเข้าร่วม (Register)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : activeTab === 'registrations' ? (
          /* REGISTRATIONS TAB - รายชื่อผู้ลงทะเบียน (สามารถเช็คสถานะได้) */
          <div className="space-y-6">
            {/* Summary Stats Panels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="registrations-summary-stats">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-widest font-sans">ลงทะเบียนทั้งหมด</p>
                  <h4 className="text-2xl font-black text-slate-800 mt-1">{validRegistrations.length} หลักสูตร</h4>
                </div>
                <BookOpen className="h-8 w-8 text-blue-500 stroke-[1.5]" />
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest font-sans">เข้าเช็คอินแล้ว</p>
                  <h4 className="text-2xl font-black text-slate-800 mt-1">{validRegistrations.filter(r => r.checkedIn).length} หลักสูตร</h4>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500 stroke-[1.5]" />
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-widest font-sans">ทำแบบประเมินเสร็จสิ้น</p>
                  <h4 className="text-2xl font-black text-slate-800 mt-1">{validRegistrations.filter(r => r.feedback).length} หลักสูตร</h4>
                </div>
                <Star className="h-8 w-8 text-amber-500 fill-amber-500/10 stroke-[1.5]" />
              </div>
            </div>

          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm overflow-hidden" id="training-history-table">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-orange-600" />
                  <span>รายชื่อหลักสูตรที่คุณลงทะเบียนสิทธิ์สัมมนาไว้ (ตรวจสอบสถานะ)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">ท่านสามารถติดตามเช็คอินและประเมินผลสัมมนาสำหรับวิชาที่ลงทะเบียนแล้วได้ที่นี่</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อโครงการที่ลงทะเบียนสะสม..."
                  value={searchQueryRegs}
                  onChange={(e) => setSearchQueryRegs(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-700 pl-10 pr-4 py-2.5 rounded-xl text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {validRegistrations.length === 0 ? (
              <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                ท่านยังไม่มีประวัติการลงทะเบียนอบรมสัมมนาในระบบ หากต้องการสำรองที่นั่งกรุณากดแท็บ "หลักสูตรทั้งหมด" ด้านบนค่ะ
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 font-bold pb-4">ชื่อหลักสูตรอบรม</th>
                      <th className="py-3 px-4 font-bold pb-4">วิทยากร</th>
                      <th className="py-3 px-4 font-bold pb-4 text-center">สถานะเช็คอิน</th>
                      <th className="py-3 px-4 font-bold pb-4 text-center">การทำแบบประเมินความพึงพอใจ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {validRegistrations
                      .filter(reg => {
                        const course = courses.find(c => c.id === reg.courseId);
                        if (!course) return false;
                        return course.title.toLowerCase().includes(searchQueryRegs.toLowerCase()) || 
                               course.speaker.toLowerCase().includes(searchQueryRegs.toLowerCase());
                      })
                      .map(reg => {
                        const matchedCourse = courses.find(c => c.id === reg.courseId);
                        
                        return (
                          <tr key={reg.id} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="py-3.5 px-4 font-extrabold text-slate-900 max-w-sm">
                              {matchedCourse?.title || reg.courseId}
                              <div className="flex gap-1.5 items-center mt-1">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide bg-slate-100 px-2 py-0.5 rounded w-fit">
                                  COURSE ID: {reg.courseId}
                                </p>
                                <button
                                  onClick={() => setPreviewRegId(reg.id)}
                                  className="text-[10px] text-violet-600 hover:text-violet-700 hover:underline font-bold cursor-pointer"
                                  title="ดูเมลรายละเอียด"
                                >
                                  ดูรายละเอียดอีเมลแจ้งเตือน
                                </button>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-700">
                              {matchedCourse?.speaker || '-'}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {reg.checkedIn ? (
                                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 border border-emerald-100 rounded-full">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  เช็คอินสำเร็จ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 border border-amber-100 rounded-full">
                                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                                  ยังไม่ได้เช็คอิน
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-xs">
                              {reg.feedback ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-full border border-emerald-100 inline-flex items-center gap-1 font-bold">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>ทำแบบประเมินแล้ว</span>
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (matchedCourse) {
                                        setShowCertCourse(matchedCourse);
                                      }
                                    }}
                                    className="mt-1 text-[11px] text-orange-600 hover:text-orange-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Award className="h-3 w-3" />
                                    <span>พิมพ์วุฒิบัตร 🎓</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                  {reg.checkedIn ? (
                                    <button
                                      onClick={() => {
                                        setSelectedEvalCourseId(reg.courseId);
                                        setActiveTab('evaluation');
                                      }}
                                      className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm min-h-[38px] mx-auto cursor-pointer"
                                    >
                                      <Star className="h-3.5 w-3.5 fill-current text-white" />
                                      <span>ทำแบบประเมินความพึงพอใจ</span>
                                    </button>
                                  ) : (
                                    <div className="flex flex-col items-center gap-1">
                                      <button
                                        disabled
                                        className="px-3.5 py-1.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-not-allowed mx-auto"
                                        title="กรุณาเช็คอินเข้าร่วมอบรมก่อนเพื่อทำแบบประเมิน"
                                      >
                                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                                        <span>ทำแบบประเมินความพึงพอใจ</span>
                                      </button>
                                      <span className="text-[10px] text-rose-500 font-bold">🔒 กรุณาสแกนเช็คอินก่อนทำแบบประเมิน</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'qr-checkin' ? (
        /* QR CHECKIN TAB */
        <div className="space-y-4">
          <button
            onClick={() => setActiveTab('registrations')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-bold text-xs shadow-xs transition duration-150 cursor-pointer"
          >
            ← ย้อนกลับไปรายงานข้อมูลการลงทะเบียนและการเข้าอบรมของฉัน
          </button>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="qr-checkin-tab-view">
          {/* Personal Digital ID Passcard */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full bg-gradient-to-tr from-slate-900 to-slate-800 text-white rounded-[2.5rem] p-8 shadow-xl border border-slate-750 relative overflow-hidden flex flex-col justify-between aspect-[3/4.5] max-w-sm mx-auto">
              
              {/* Gold watermark / branding header */}
              <div className="flex justify-between items-start border-b border-slate-700 pb-4">
                <div>
                  <h3 className="text-amber-400 font-extrabold text-[12px] uppercase tracking-widest font-sans">BANGKOK UNIVERSITY</h3>
                  <p className="text-[9px] text-slate-300 font-semibold tracking-wide uppercase">Short Training Digital Passport ID</p>
                </div>
                <div className="bg-amber-400/10 border border-amber-400/20 text-amber-400 font-black text-[9px] py-1 px-2 rounded-full font-mono">
                  STAFF ACTIVE
                </div>
              </div>

              {/* Avatar Circle and Profile Description */}
              <div className="flex flex-col items-center text-center my-6 space-y-3">
                <div className="w-20 h-20 bg-amber-400/10 border-2 border-amber-400 rounded-full flex items-center justify-center text-amber-400 font-extrabold">
                  <User className="h-10 w-10 stroke-[1.5]" />
                </div>
                <div>
                  <h4 className="text-lg font-black tracking-tight text-white">{userName}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{department}</p>
                </div>
                <p className="text-[10px] font-bold text-slate-500 font-mono tracking-wider bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700">
                  ID: {personnelId || "กำลังประเมินรหัส..."}
                </p>
              </div>

              {/* Dynamic scannable QR code */}
              <div className="p-3 bg-white rounded-3xl self-center mx-auto mb-4 border border-slate-200 flex flex-col items-center justify-center shadow-md">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`BU_STAFF_ID:${personnelId || 'PENDING'}|EMAIL:${cleanUserEmail || ''}`)}`}
                  alt="Staff QR Passport Code"
                  className="w-36 h-36 rounded-2xl object-contain bg-white border border-slate-100 p-1"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="text-center">
                <p className="text-[10px] text-slate-400 leading-snug">
                  * ให้เจ้าหน้าที่ส่วนกลางใช้เครื่องแฮนด์เฮลด์แสกนรหัสนี้เพื่อยืนยันสถานะเข้าร่วมกิจกรรมได้ในทันที
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Self Scanner Side */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4">
                <QrIcon className="h-5 w-5 text-orange-605" />
                <span>สแกนยืนยันการเช็คอินด้วยตนเอง (Self Check-In Portal)</span>
              </h2>

              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                หากท่านเดินทางมาเข้าร่วมโครงการอบรมหน้างานสัมมนาแล้ว ท่านสามารถแสดงเจตจำนงส่งพิกัดยืนยันตนด้วย QR-Code ตัวจับกล้องแอปพิจารณาเปิดล็อกเวลาอบรมได้ทันที
              </p>

              {/* Course Selector Dropdown */}
              <div className="space-y-2 mb-6">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block font-sans">
                  🎯 เลือกหลักสูตรที่คุณลงทะเบียนไว้ (ที่รอเช็คอิน)
                </label>
                <select
                  value={selectedQrCourseId}
                  onChange={(e) => {
                    setSelectedQrCourseId(e.target.value);
                    setCheckInError('');
                  }}
                  className="w-full bg-white border border-slate-205 p-3 rounded-xl text-slate-800 font-extrabold text-sm focus:ring-1 focus:ring-orange-500 focus:outline-none cursor-pointer"
                >
                  <option value="">-- กรุณาเลือกหลักสูตรที่ต้องการสแกนเข้า --</option>
                  {courses
                    .filter(c => validRegistrations.some(r => r.courseId === c.id && !r.checkedIn))
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.date} | {c.title}
                      </option>
                    ))
                  }
                </select>
              </div>

              {selectedQrCourseId ? (
                (() => {
                  const targetCourse = courses.find(c => c.id === selectedQrCourseId);
                  if (!targetCourse) return null;
                  
                  return (
                    <div className="space-y-5 animate-fadeIn">
                      {/* Selected Course summary info */}
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-600 space-y-2.5">
                        <p className="flex justify-between items-center"><strong>ผู้จัดบรรยาย:</strong> <span className="font-extrabold text-slate-800">{targetCourse.speaker}</span></p>
                        <p className="flex justify-between items-center"><strong>สถานที่เข้าเรียน:</strong> <span className="font-bold text-slate-800">{targetCourse.location}</span></p>
                        <p className="flex justify-between items-center"><strong>ช่วงเปิดลงทะเบียน:</strong> <span className="font-bold text-slate-800">{targetCourse.date} • {targetCourse.time} น.</span></p>
                        <p className="flex justify-between items-center">
                          <strong>สัญญาณเวลาควบคุมระบบ:</strong> 
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${targetCourse.qrOpened ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {targetCourse.qrOpened ? "สัญญาณพร้อมเปิดใช้งาน" : "แอดมินปิดการรับข้อมูล"}
                          </span>
                        </p>
                      </div>

                      {/* VIEWFINDER SIMULATOR AND CAMERA OVERLAY */}
                      <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden group min-h-[250px]">
                        
                        {/* Interactive animated laser scanning bar */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-scan-laser"></div>
                        <Camera className="h-10 w-10 text-slate-500 animate-pulse mb-3" />
                        <span className="text-xs text-slate-400 font-semibold mb-6">เลนส์กล้องจำลองความร้อนจับสัญญานพร้อมประมวลผล QR</span>
                        <button
                          onClick={() => {
                            setCheckInCourse(targetCourse);
                            setShowCheckInModal(true);
                            performDirectCheckIn(targetCourse);
                          }}
                          className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer min-h-[44px]"
                        >
                          สแกนเช็คอินแบบจำลองอัตโนมัติ (Simulate Auto QR Scan)
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400 text-xs font-semibold">
                  🎯 กรุณาเลือกหลักสูตรที่ลงทะเบียนไว้เพื่อสแกนเช็คอิน
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      ) : activeTab === 'evaluation' ? (
        /* EVALUATION TAB */
        <div className="space-y-6">
          <button
            onClick={() => setActiveTab('registrations')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-bold text-xs shadow-xs transition duration-150 cursor-pointer"
          >
            ← ย้อนกลับไปประวัติการอบรม
          </button>
          
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-850 flex items-center gap-2 mb-4">
              <Star className="h-5 w-5 text-amber-500 fill-amber-500/10" />
              <span>ประเมินความพึงพอใจการอบรมหลักสูตรสะสมเกียรติประวัติ (Evaluation)</span>
            </h2>

            <div className="space-y-2 mb-6">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block font-sans">
                ✍️ เลือกหลักสูตรที่คุณเข้าร่วมและต้องการทำแบบประเมิน
              </label>
              <select
                value={selectedEvalCourseId}
                onChange={(e) => {
                  setSelectedEvalCourseId(e.target.value);
                  setHasOpenedCustomSurvey(false);
                  setAffiliation('');
                  setAffiliationOther('');
                  setPart2Before(5);
                  setPart2After(5);
                  setAnswers({});
                }}
                className="w-full bg-white border border-slate-205 p-3 rounded-xl text-slate-800 font-extrabold text-sm focus:ring-1 focus:ring-orange-500 focus:outline-none cursor-pointer"
              >
                <option value="">-- กรุณาเลือกหลักสูตรที่ต้องการทำแบบประเมิน --</option>
                {(() => {
                  const registeredPending = courses.filter(c => {
                    const reg = validRegistrations.find(r => r.courseId === c.id);
                    return reg && reg.checkedIn && !reg.feedback;
                  });
                  const completedEvaluations = courses.filter(c => {
                    const reg = validRegistrations.find(r => r.courseId === c.id);
                    return reg && reg.checkedIn && reg.feedback;
                  });

                  // Ensure currently selected course is always in the list
                  if (selectedEvalCourseId) {
                    const isPending = registeredPending.some(c => c.id === selectedEvalCourseId);
                    const isCompleted = completedEvaluations.some(c => c.id === selectedEvalCourseId);
                    if (!isPending && !isCompleted) {
                      const currentSelected = courses.find(c => c.id === selectedEvalCourseId);
                      if (currentSelected) {
                        const reg = validRegistrations.find(r => r.courseId === selectedEvalCourseId);
                        if (reg && reg.checkedIn) {
                          if (reg.feedback) {
                            completedEvaluations.push(currentSelected);
                          } else {
                            registeredPending.push(currentSelected);
                          }
                        }
                      }
                    }
                  }

                  return (
                    <>
                      {registeredPending.length > 0 && (
                        <optgroup label="หลักสูตรที่พร้อมทำแบบประเมิน (เช็คอินเข้าร่วมแล้ว)">
                          {registeredPending.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.date} | {c.title}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {completedEvaluations.length > 0 && (
                        <optgroup label="หลักสูตรที่คุณทำแบบประเมินเสร็จสิ้นแล้ว">
                          {completedEvaluations.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.date} | {c.title} (ประเมินแล้ว)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </>
                  );
                })()}
              </select>
            </div>

            {selectedEvalCourseId ? (
              (() => {
                const targetEval = courses.find(c => c.id === selectedEvalCourseId);
                if (!targetEval) {
                  return (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 text-center mt-6">
                      <p className="text-sm font-bold text-rose-800">
                        ⚠️ ไม่พบข้อมูลหลักสูตรที่ตรงกับรหัสอ้างอิงในระบบ (หรือหลักสูตรนี้อาจถูกปิดการมองเห็น/ลบแล้ว)
                      </p>
                      <p className="text-xs text-slate-500 font-semibold mt-1">
                        กรุณาเลือกหลักสูตรที่ท่านลงทะเบียนเรียนไว้จากรายการใน "เมนูดร็อปดาวน์ด้านบน" เพื่อเขียนแบบประเมินความพึงพอใจค่ะ 🙏
                      </p>
                    </div>
                  );
                }

                const reg = validRegistrations.find(r => r.courseId === selectedEvalCourseId);
                const isEligible = reg && reg.checkedIn;
                if (!isEligible) {
                  return (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center mt-6 max-w-lg mx-auto shadow-sm">
                      <p className="text-sm font-bold text-rose-800">
                        🔒 คุณยังไม่ได้เช็คอินเข้าร่วมโครงการอบรมนี้
                      </p>
                      <p className="text-xs text-slate-500 font-semibold mt-2 leading-relaxed">
                        ผู้เข้าร่วมอบรมสามารถทำแบบประเมินความพึงพอใจได้เฉพาะโครงการที่คุณได้ลงทะเบียนและสแกนเช็คอินเข้าร่วมเรียนแล้วเท่านั้นค่ะ 🙏
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-600 space-y-2.5">
                      <p className="flex justify-between items-center"><strong>หลักสูตร:</strong> <span className="font-extrabold text-slate-800">{targetEval.title}</span></p>
                      <p className="flex justify-between items-center"><strong>วิทยากรหลัก:</strong> <span className="font-bold text-slate-800">{targetEval.speaker}</span></p>
                      <p className="flex justify-between items-center"><strong>วันและเวลาสัมมนา:</strong> <span className="font-bold text-slate-800">{targetEval.date} • {targetEval.time} น.</span></p>
                    </div>

                    {false ? (
                      /* QUICK SURVEY FOR EXTERNAL LINK */
                      <div className="space-y-6">
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-2 font-sans" id="custom-survey-url-notice">
                          <strong className="block font-bold text-sm text-blue-900">📋 หลักสูตรนี้ใช้แบบประเมินภายนอก (Google Forms / Apps Script):</strong>
                          <p className="leading-relaxed font-medium">
                            เพื่อเก็บสถิติภาพรวมเข้าระบบประเมินของสถาบันและทำการอนุมัติวุฒิบัตรสะสมเครดิตให้กับท่านโดยอัตโนมัติ กรุณาดำเนินการดังนี้:
                          </p>
                          <ol className="list-decimal list-inside space-y-1.5 ml-1 font-semibold text-blue-850">
                            <li>ให้คะแนนความพึงพอใจและระดับการแนะนำเบื้องต้นด้านล่าง</li>
                            <li>คลิกปุ่มสีน้ำเงินเพื่อเปิดทำแบบประเมินฉบับเต็มภายนอก</li>
                            <li>กลับมากดปุ่มสีเขียวด้านล่างสุดเพื่อบันทึกและเปิดรับเกียรติบัตร</li>
                          </ol>
                          <div className="pt-2 flex flex-wrap items-center gap-2">
                            <a
                              href={targetEval.customSurveyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setHasOpenedCustomSurvey(true)}
                              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-5 py-3 rounded-xl shadow-xs transition duration-150 text-xs cursor-pointer min-h-[44px]"
                              id="btn-open-external-survey"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>คลิกเปิดลิงก์เพื่อทำแบบประเมินฉบับเต็มภายนอก →</span>
                            </a>
                            {hasOpenedCustomSurvey && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 border border-emerald-150 px-3 py-1.5 rounded-xl">
                                <Check className="h-4 w-4 text-emerald-600" />
                                เปิดลิงก์แล้ว
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Satisfaction ratings */}
                        <div className="space-y-3">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
                            1. คุณรู้สึกพึงพอใจและได้ประโยชน์ภาพลักษณ์ความรู้จากโครงการในระดับใด? (Satisfaction Star)
                          </label>
                          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                            <div className="flex gap-1.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setSurveySatisfaction(star)}
                                  className="p-1 hover:scale-110 transition relative min-h-[40px] min-w-[40px]"
                                >
                                  <Star 
                                    className={`h-8 w-8 ${
                                      star <= (surveySatisfaction || 0) 
                                        ? 'fill-amber-400 text-amber-400' 
                                        : 'text-slate-200'
                                    }`} 
                                  />
                                </button>
                              ))}
                            </div>
                            <span className="text-xs font-black text-slate-800 bg-amber-50 px-3 py-1 rounded border border-amber-100">
                              {surveySatisfaction === 5 ? "ดีเยี่ยม (100%)" :
                               surveySatisfaction === 4 ? "ดีมาก (80%)" :
                               surveySatisfaction === 3 ? "ปานกลาง (60%)" :
                               surveySatisfaction === 2 ? "ต้องปรับปรุง (40%)" : 
                               surveySatisfaction === 1 ? "ไม่พึงพอใจอย่างยิ่ง (20%)" : "ยังไม่ได้เลือกประเมิน"}
                            </span>
                          </div>
                        </div>

                        {/* Recommendation Level */}
                        <div className="space-y-3">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
                            2. ความเต็มใจที่คุณประสงค์จะแนะนำโครงการอบรมสัมมนานี้ให้แก่บุคลากรคณาจารย์ท่านอื่น? (Recommendation Star)
                          </label>
                          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-100">
                            <div className="flex gap-1.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setSurveyRecommendation(star)}
                                  className="p-1 hover:scale-110 transition relative min-h-[40px] min-w-[40px]"
                                >
                                  <Star 
                                    className={`h-8 w-8 ${
                                      star <= (surveyRecommendation || 0) 
                                        ? 'fill-slate-800 text-slate-800' 
                                        : 'text-slate-200'
                                    }`} 
                                  />
                                </button>
                              ))}
                            </div>
                            <span className="text-xs font-black text-slate-800 bg-slate-50 px-3 py-1 rounded border border-slate-150">
                              {surveyRecommendation === 5 ? "แนะนำแน่นอนที่สุด" :
                               surveyRecommendation === 4 ? "แนะนำระดับพึงใจ" :
                               surveyRecommendation === 3 ? "ปานกลาง" :
                               surveyRecommendation === 2 ? "อาจจะแนะนำยาก" : 
                               surveyRecommendation === 1 ? "ไม่ประสงค์แนะนำ" : "ยังไม่ได้เลือกประเมิน"}
                            </span>
                          </div>
                        </div>

                        {/* Feedback Comments comments */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700">
                            3. ความคิดเห็น/ข้อเสนอแนะเพิ่มเติม เพื่อพัฒนาปรับปรุงระบบหรือหัวข้อของวิทยากรในวิจัยครั้งถัดไป
                          </label>
                          <textarea
                            placeholder="ขอบคุณผู้จัดโครงการ วิทยากรปาร์จารย์ หรือฝากข้อความแนะนำเรื่องที่สนใจในโอกาสหน้า..."
                            value={surveyComments}
                            onChange={(e) => setSurveyComments(e.target.value)}
                            rows={3}
                            className="w-full text-slate-800 bg-white border border-slate-205 p-3 rounded-2xl text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none transition"
                            id="input-survey-comments"
                          />
                        </div>
                      </div>
                    ) : (
                      /* FULL DYNAMIC QUESTIONNAIRE */
                      <div className="space-y-6">
                        {/* Part 1: Affiliations */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider font-sans">
                            ส่วนที่ 1: สังกัดหน่วยงานผู้รับการอบรม *
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-4 rounded-2xl border border-slate-100">
                            {activeEvalConfig.part1Affiliations.map((opt) => (
                              <label key={opt} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition text-xs font-semibold text-slate-700">
                                <input
                                  type="radio"
                                  name="affiliation"
                                  value={opt}
                                  checked={affiliation === opt}
                                  onChange={(e) => setAffiliation(e.target.value)}
                                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-slate-300"
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                          {affiliation === 'อื่นๆ' && (
                            <input
                              type="text"
                              placeholder="กรุณาระบุสังกัดหน่วยงานของคุณ..."
                              value={affiliationOther}
                              onChange={(e) => setAffiliationOther(e.target.value)}
                              className="w-full text-slate-800 bg-white border border-slate-205 p-3 rounded-2xl text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none transition animate-fadeIn"
                            />
                          )}
                        </div>

                        {/* Part 2: Knowledge assessment before & after */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider font-sans">
                            ส่วนที่ 2: การประเมินตนเอง (ก่อน-หลังการอบรมสัมมนา) *
                          </label>
                          <div className="space-y-4 bg-white p-4 rounded-2xl border border-slate-100">
                            {/* Before */}
                            <div className="space-y-2 pb-3 border-b border-slate-50">
                              <span className="text-xs font-semibold text-slate-700 block leading-relaxed">
                                {activeEvalConfig.part2BeforeLabel.replace(/{course_title}/g, targetEval.title)}
                              </span>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex gap-1.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => setPart2Before(star)}
                                      className="p-1 hover:scale-110 transition relative min-h-[40px] min-w-[40px]"
                                    >
                                      <Star 
                                        className={`h-7 w-7 ${
                                          star <= (part2Before || 0) 
                                            ? 'fill-orange-400 text-orange-400' 
                                            : 'text-slate-200'
                                        }`} 
                                      />
                                    </button>
                                  ))}
                                </div>
                                <span className="text-[11px] font-bold text-orange-700 bg-orange-50 px-2.5 py-1 rounded border border-orange-100">
                                  ระดับ {part2Before ? `${part2Before} / 5` : 'ยังไม่ได้ประเมิน'}
                                </span>
                              </div>
                            </div>

                            {/* After */}
                            <div className="space-y-2">
                              <span className="text-xs font-semibold text-slate-700 block leading-relaxed">
                                {activeEvalConfig.part2AfterLabel.replace(/{course_title}/g, targetEval.title)}
                              </span>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex gap-1.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => setPart2After(star)}
                                      className="p-1 hover:scale-110 transition relative min-h-[40px] min-w-[40px]"
                                    >
                                      <Star 
                                        className={`h-7 w-7 ${
                                          star <= (part2After || 0) 
                                            ? 'fill-emerald-500 text-emerald-500' 
                                            : 'text-slate-200'
                                        }`} 
                                      />
                                    </button>
                                  ))}
                                </div>
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-100">
                                  ระดับ {part2After ? `${part2After} / 5` : 'ยังไม่ได้ประเมิน'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Part 3: Questions list */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider font-sans">
                            ส่วนที่ 3: ความพึงพอใจต่อรายละเอียดและภาพรวมของโครงการ
                          </label>
                          <div className="space-y-4 bg-white p-4 rounded-2xl border border-slate-100">
                            {activeEvalConfig.part3Questions.map((q, idx) => {
                              const value = answers[q.id];

                              return (
                                <div key={q.id} className="space-y-2.5 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                                  <label className="block text-xs font-semibold text-slate-850 leading-relaxed">
                                    {idx + 1}. {q.text} {q.required && <span className="text-red-500 font-bold">*</span>}
                                  </label>
                                  
                                  {q.type === 'rating' ? (
                                    <div className="flex flex-wrap items-center gap-3">
                                      <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <button
                                            key={star}
                                            type="button"
                                            onClick={() => {
                                              const updated = { ...answers, [q.id]: star };
                                              setAnswers(updated);
                                              if (q.id === 'q8' || q.text.includes('พึงพอใจโดยรวม')) {
                                                setSurveySatisfaction(star);
                                              }
                                            }}
                                            className="p-1 hover:scale-110 transition relative min-h-[40px] min-w-[40px]"
                                          >
                                            <Star 
                                              className={`h-7 w-7 ${
                                                star <= (typeof value === 'number' ? value : 0)
                                                  ? 'fill-amber-400 text-amber-400' 
                                                  : 'text-slate-200'
                                              }`} 
                                            />
                                          </button>
                                        ))}
                                      </div>
                                      <span className="text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                        ระดับ {value !== undefined ? `${value} / 5` : 'ยังไม่ได้ประเมิน'}
                                      </span>
                                    </div>
                                  ) : (
                                    <textarea
                                      rows={2}
                                      placeholder="เขียนความคิดเห็น/ข้อเสนอแนะเกี่ยวกับหัวข้อนี้..."
                                      value={typeof value === 'string' ? value : ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updated = { ...answers, [q.id]: val };
                                        setAnswers(updated);
                                        if (q.id === 'q9' || q.text.includes('ข้อเสนอแนะเพิ่มเติม')) {
                                          setSurveyComments(val);
                                        }
                                      }}
                                      className="w-full text-slate-800 bg-white border border-slate-200 p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none transition"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Part 4: Recommendation level */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider font-sans">
                            ส่วนที่ 4: การแนะนำโครงการ *
                          </label>
                          <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3">
                            <span className="text-xs font-semibold text-slate-700 block leading-relaxed">
                              ความเต็มใจที่คุณประสงค์จะแนะนำโครงการอบรมสัมมนานี้ให้แก่บุคลากรคณาจารย์ท่านอื่น?
                            </span>
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => setSurveyRecommendation(star)}
                                    className="p-1 hover:scale-110 transition relative min-h-[40px] min-w-[40px]"
                                  >
                                    <Star 
                                      className={`h-8 w-8 ${
                                        star <= (surveyRecommendation || 0) 
                                          ? 'fill-slate-800 text-slate-800' 
                                          : 'text-slate-200'
                                      }`} 
                                    />
                                  </button>
                                ))}
                              </div>
                              <span className="text-xs font-black text-slate-800 bg-slate-50 px-3 py-1 rounded border border-slate-150">
                                {surveyRecommendation === 5 ? "แนะนำแน่นอนที่สุด" :
                                 surveyRecommendation === 4 ? "แนะนำระดับพึงใจ" :
                                 surveyRecommendation === 3 ? "ปานกลาง" :
                                 surveyRecommendation === 2 ? "อาจจะแนะนำยาก" : 
                                 surveyRecommendation === 1 ? "ไม่ประสงค์แนะนำ" : "ยังไม่ได้เลือกประเมิน"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={async () => {
                        const target = courses.find(c => c.id === selectedEvalCourseId);
                        if (target) {
                          // Validate required affiliation
                          if (!affiliation) {
                            alert('กรุณาเลือกสังกัดหน่วยงานผู้รับการอบรมในส่วนที่ 1 ค่ะ');
                            return;
                          }
                          if (affiliation === 'อื่นๆ' && !affiliationOther.trim()) {
                            alert('กรุณาระบุสังกัดหน่วยงานของคุณในส่วนที่ 1 ค่ะ');
                            return;
                          }

                          // Validate Part 2: before & after
                          if (part2Before === null || part2Before === 0 || part2After === null || part2After === 0) {
                            alert('กรุณาทำแบบประเมินตนเอง (ก่อน-หลังการอบรม) ในส่วนที่ 2 ให้ครบถ้วนก่อนส่งค่ะ');
                            return;
                          }

                          // Validate required questions
                          const missingRequired = activeEvalConfig.part3Questions.some(q => {
                            if (q.required) {
                              const val = answers[q.id];
                              if (q.type === 'text') {
                                return !val || String(val).trim() === '';
                              } else {
                                return val === undefined || val === null || val === 0;
                              }
                            }
                            return false;
                          });

                          if (missingRequired) {
                            alert('กรุณากรอกข้อมูลแบบประเมินในหัวข้อที่มีเครื่องหมายดอกจันสีแดง (*) ให้ครบถ้วนก่อนส่งค่ะ');
                            return;
                          }

                          // Validate Part 4: Recommendation
                          if (surveyRecommendation === null || surveyRecommendation === 0) {
                            alert('กรุณาเลือกความพึงพอใจระดับการแนะนำในส่วนที่ 4 ก่อนส่งค่ะ');
                            return;
                          }

                          setSubmitting(true);
                          const id = `${target.id}_${cleanUserEmail.replace(/\./g, '_')}`;

                          const finalSatisfaction = typeof answers['q8'] === 'number' ? answers['q8'] : surveySatisfaction;
                          const finalComments = typeof answers['q9'] === 'string' ? answers['q9'] : surveyComments;

                          const feedbackObj: Feedback = {
                            satisfaction: finalSatisfaction,
                            recommendation: surveyRecommendation,
                            comments: finalComments,
                            submittedAt: new Date().toISOString(),
                            affiliation: affiliation || department || 'ฝ่ายทั่วไป',
                            affiliationOther: affiliation === 'อื่นๆ' ? affiliationOther : '',
                            part2Before: part2Before,
                            part2After: part2After,
                            answers: answers
                          };

                          try {
                            const docRef = doc(db, 'registrations', id);
                            const docSnap = await getDoc(docRef);

                            if (!docSnap.exists()) {
                              // If they accessed directly but didn't have a registration doc, create it
                              const newReg: Registration = {
                                id,
                                courseId: target.id,
                                email: cleanUserEmail,
                                personnelId: personnelId || 'TEMP-' + Math.floor(1000 + Math.random()*9000),
                                name: userName,
                                department: department || 'สำนักวิชาการ',
                                registeredAt: new Date().toISOString(),
                                checkedIn: true,
                                checkedInAt: new Date().toISOString(),
                                feedback: feedbackObj
                              };
                              await setDoc(docRef, newReg);
                              setRegistrations(prev => [...prev, newReg]);
                            } else {
                              const regData = docSnap.data();
                              const wasCheckedIn = regData?.checkedIn || false;
                              const checkedInAtVal = regData?.checkedInAt || new Date().toISOString();
                              await updateDoc(docRef, {
                                feedback: feedbackObj,
                                checkedIn: true,
                                checkedInAt: checkedInAtVal
                              });
                              setRegistrations(prev => prev.map(r => r.id === id ? { 
                                ...r, 
                                feedback: feedbackObj,
                                checkedIn: true,
                                checkedInAt: r.checkedInAt || checkedInAtVal
                              } : r));
                            }
                            
                            alert(`ส่งผลประเมินสำเร็จเสร็จสิ้นสำหรับหัวข้อ "${target.title}" เรียบร้อยค่ะ!\nคุณสามารถเปิดคลิกดูและดาวน์โหลดใบประกาศวุฒิบัตรได้ที่แท็บเมนูด้านล่างนี้เลยค่ะ 🙏🌟`);
                            
                            // Clear form states
                            setSurveySatisfaction(5);
                            setSurveyRecommendation(5);
                            setSurveyComments('');
                            setSelectedEvalCourseId('');
                            setHasOpenedCustomSurvey(false);
                            setAffiliation('');
                            setAffiliationOther('');
                            setPart2Before(5);
                            setPart2After(5);
                            setAnswers({});
                          } catch (err) {
                            console.error(err);
                            alert('สภาวะการอัปเดตแบบประเมินขัดข้อง โปรดติดต่อสำนักทะเบียนเพื่อกู้คืนสิทธิ์');
                          } finally {
                            setSubmitting(false);
                          }
                        }
                      }}
                      disabled={submitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold py-3.5 rounded-2xl text-xs shadow-md transition duration-150 flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      <span>{submitting ? "กำลังส่งบันทึกความคิดเห็น..." : "บันทึกและส่งผลประเมินความพึงพอใจโครงการ (Submit Evaluation & Review)"}</span>
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400 text-xs font-semibold">
                {courses.filter(c => validRegistrations.some(r => r.courseId === c.id && !r.feedback)).length > 0 
                  ? "✍️ กรุณาเลือกคอร์สที่สัมมนาแล้วค้างทำประเมินในเมนูดร็อปดาวน์ด้านบนเพื่อเขียนความเห็น"
                  : "ยอดเยี่ยมมากค่ะ! คุณกรอกแบบประเมินกิจกรรมสะสมครบถ้วนเรียบร้อยทั้งหมดแล้วสำหรับโครงการที่เข้าเรียนค่ะ ✨"
                }
              </div>
            )}
          </div>
          

          {/* List of Checked-In History with Certificates */}
          <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2 mb-4">
              <Award className="h-5 w-5 text-amber-500 fill-amber-500/10" />
              <span>ประวัติการสะสมเครดิตเรียนและวุฒิบัตรของฉัน (My Certificates)</span>
            </h3>

            {validRegistrations.filter(r => r.checkedIn).length === 0 ? (
              <p className="text-slate-400 text-xs py-8 text-center border border-dashed border-slate-150 rounded-2xl">
                ยังไม่มีข้อมูลหลักสูตรที่เข้าอบรมสำเร็จในระบบ เมื่อท่านทำการสแกนเช็คอินเข้าเรียนครบเรียบร้อยแล้ว วุฒิบัตรประกาศเกียรติคุณฉบับเต็มจะมาแสดงสะสมตรงนี้โดยอัตโนมัติค่ะ ✨
              </p>
            ) : (
              <div className="space-y-4">
                {validRegistrations
                  .filter(r => r.checkedIn)
                  .map(reg => {
                    const course = courses.find(c => c.id === reg.courseId);
                    if (!course) return null;
                    
                    return (
                      <div key={reg.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-xs transition">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm leading-snug">{course.title}</h4>
                          <p className="text-xs text-slate-500 mt-1">วิทยากรหลัก: {course.speaker}</p>
                          <p className="text-xs text-slate-400 mt-0.5">วันที่อบรม: {course.date} • เช็คอินเข้างานสำเร็จ</p>
                        </div>

                        <button
                          onClick={() => setShowCertCourse(course)}
                          className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-black text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition min-h-[44px]"
                        >
                          <Award className="h-4 w-4 text-amber-400 fill-amber-400/20" />
                          <span>ดูวุฒิบัตร (View Cert)</span>
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* DETAILED CHECK-IN & SURVEY MODAL */}
      {showCheckInModal && checkInCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full uppercase">
                  {checkInSuccess 
                    ? (proceedToSurvey ? 'แบบประเมินคุณลักษณะอบรม' : 'เช็คอินสำเร็จเรียบร้อยแล้ว') 
                    : 'ระบบแสกนยืนยันเช็คอิน'
                  }
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 mt-2 leading-snug">
                  {checkInCourse.title}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowCheckInModal(false);
                  setCheckInSuccess(false);
                  setProceedToSurvey(false);
                  setCheckInError('');
                }}
                className="text-slate-400 hover:text-slate-700 p-2 text-xl font-bold min-h-[44px]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body with Scroll */}
            <div className="p-6 overflow-y-auto flex-1">
              {!checkInSuccess ? (
                /* STEP 1: SCAN CHECKIN / CONFIRM CHECKIN */
                <div className="space-y-5" id="step-confirm-checkin">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs text-slate-600 space-y-2">
                    <p className="flex justify-between"><strong>วิทยากรหลัก:</strong> <span>{checkInCourse.speaker}</span></p>
                    <p className="flex justify-between"><strong>วันอบรม:</strong> <span>{checkInCourse.date}</span></p>
                    <p className="flex justify-between"><strong>ช่วงเวลา:</strong> <span>{checkInCourse.time} น.</span></p>
                    <p className="flex justify-between"><strong>สถานที่จัดงาน:</strong> <span>{checkInCourse.location}</span></p>
                  </div>

                  {/* Automated Auto Check-In Processing UI */}
                  <div className="border border-slate-200 rounded-2xl p-6 bg-orange-50/55 flex flex-col items-center justify-center space-y-4">
                    {submitting ? (
                      <div className="flex flex-col items-center justify-center py-4 space-y-2">
                        <div className="h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-extrabold text-orange-700 animate-pulse mt-2">กำลังดำเนินการเช็คอินอัตโนมัติ (Auto-Checking in)...</p>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-1">
                        <CheckCircle2 className="h-8 w-8 animate-bounce" />
                      </div>
                    )}
                    <h4 className="text-xs font-extrabold text-slate-800 text-center">สแกนตรวจสอบสิทธิ์สำเร็จ (QR Verified!)</h4>
                    <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                      ระบบตรวจพบการล็อกอินด้วยบัญชี {userEmail} เรียบร้อยแล้ว ขณะนี้กำลังบันทึกประวัติการอบรมของคุณและเชื่อมโยงกับระบบสารสนเทศโดยอัตโนมัติ
                    </p>
                  </div>

                  {checkInError && (
                    <div className="bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-xl text-xs flex gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>ปฏิเสธการเซ็นหลักยึดเช็คอิน:</strong>
                        <p className="mt-0.5">{checkInError}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirmCheckIn}
                      disabled={submitting}
                      className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition duration-150 flex items-center justify-center gap-1.5 relative min-h-[44px]"
                      id="btn-confirm-checkin-action"
                    >
                      {submitting ? '🔄 กำลังบันทึกเช็คอินอัตโนมัติ...' : '👉 คลิกเพื่อเช็คอินด้วยตนเอง (หากไม่มีการเปลี่ยนหน้าอัตโนมัติ)'}
                    </button>
                  </div>
                </div>
              ) : !proceedToSurvey ? (
                /* STEP 1.5: DELIGHTFUL SUCCESS CONFIRMATION SCREEN */
                <div className="space-y-6 text-center py-4" id="step-checkin-completed-successfully">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-md mb-3">
                      <CheckCircle2 className="h-10 w-10 animate-pulse" />
                    </div>
                    <h3 className="text-lg font-black text-slate-850 leading-tight">
                      เช็คอินสำเร็จเรียบร้อยแล้วค่ะ! 🎉
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      บันทึกประวัติเข้าร่วมกิจกรรมหลักสูตรอบรมเสร็จสิ้นสมบูรณ์
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-left text-xs space-y-2.5">
                    <div className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider flex items-center gap-1 bg-emerald-100/60 py-0.5 px-2.5 rounded-full w-fit">
                      🎫 รายละเอียดตั๋วประวัติการเข้างาน
                    </div>
                    <div className="divide-y divide-slate-100 text-slate-700">
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">หลักสูตร:</span>
                        <span className="font-extrabold text-slate-900 text-right">{checkInCourse.title}</span>
                      </div>
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">ผู้เข้าอบรม:</span>
                        <span className="font-extrabold text-slate-950 text-right">{userName}</span>
                      </div>
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">อีเมลมหาลัย:</span>
                        <span className="font-bold text-slate-900">{userEmail}</span>
                      </div>
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">สถานะตั๋ว:</span>
                        <span className="text-emerald-750 font-extrabold flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>
                          Verified & Saved (เช็คอินแล้ว)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left text-[11px] leading-relaxed text-slate-600 flex gap-2">
                    <span className="text-xs">✉️</span>
                    <div>
                      <strong>ส่งเมลยืนยันสำเร็จ:</strong>
                      <p className="mt-0.5 text-slate-500">ระบบได้ส่งลิงก์ข้อมูลการเช็คอินและรายละเอียดเข้าสู่อีเมลมหาวิทยาลัย <code className="font-mono bg-slate-200/50 px-1 py-0.2 rounded text-slate-800">{userEmail}</code> เรียบร้อยแล้วค่ะ</p>
                    </div>
                  </div>

                   <div className="pt-2 space-y-2">
                    <button
                      onClick={() => {
                        setProceedToSurvey(true);
                      }}
                      className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold py-3.5 rounded-xl text-xs shadow-md cursor-pointer flex items-center justify-center gap-1.5 transition duration-200"
                    >
                      <Star className="h-4 w-4 fill-current text-white" />
                      <span>ทำแบบประเมินความพึงพอใจทันทีเพื่อรับวุฒิบัตร 🎓</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowCheckInModal(false);
                        setCheckInSuccess(false);
                        setProceedToSurvey(false);
                      }}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs transition duration-200 cursor-pointer"
                    >
                      <span>ปิดหน้าต่างนี้ (ทำประเมินภายหลัง)</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: FILL SATISFACTION EVALUATION */
                <div className="space-y-6" id="step-submit-evaluation">
                  <div className="bg-emerald-50 border border-emerald-100 text-emerald-900 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span>เช็คอินเข้างานสำเร็จเรียบร้อย! กรุณากรอกแบบประเมินความพึงพอใจเพื่อเสร็จสิ้นกระบวนงาน</span>
                  </div>

                  {/* Satisfaction level */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      1. ความพึงพอใจโดยรวมต่อการเข้ารับฟังรอบนี้ (Satisfaction)
                    </label>
                    <div className="flex justify-between items-center gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSurveySatisfaction(star)}
                          className="p-1 hover:scale-110 transition relative min-h-[44px] min-w-[44px]"
                        >
                          <Star 
                            className={`h-8 w-8 ${
                              star <= (surveySatisfaction || 0) 
                                ? 'fill-amber-400 text-amber-400' 
                                : 'text-slate-300'
                            }`} 
                          />
                        </button>
                      ))}
                      <span className="text-xs font-extrabold text-slate-800">
                        {surveySatisfaction !== null ? `${surveySatisfaction * 20}%` : 'ยังไม่ได้เลือกประเมิน'}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation level */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      2. ความต้องการจะแนะนำในโครงอบรมถัดไป (Recommendation)
                    </label>
                    <div className="flex justify-between items-center gap-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSurveyRecommendation(star)}
                          className="p-1 hover:scale-110 transition relative min-h-[44px] min-w-[44px]"
                        >
                          <Star 
                            className={`h-8 w-8 ${
                              star <= (surveyRecommendation || 0) 
                                ? 'fill-slate-800 text-slate-800' 
                                : 'text-slate-300'
                            }`} 
                          />
                        </button>
                      ))}
                      <span className="text-xs font-extrabold text-slate-800">
                        {surveyRecommendation !== null ? `${surveyRecommendation * 20}%` : 'ยังไม่ได้เลือกประเมิน'}
                      </span>
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      3. ข้อแนะนำ/ความคิดเห็นเพิ่มเติมเพื่อพัฒนาระบบ
                    </label>
                    <textarea
                      placeholder="เขียนขอบคุณวิทยากร หรือระบุข้อแนะนำเพิ่มเติม..."
                      value={surveyComments}
                      onChange={(e) => setSurveyComments(e.target.value)}
                      rows={3}
                      className="w-full text-slate-800 border border-slate-200 p-3 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                      id="input-survey-comments"
                    />
                  </div>

                  <button
                    onClick={handleSubmitFeedback}
                    disabled={submitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs shadow-md transition duration-150 flex items-center justify-center gap-1.5 relative min-h-[44px]"
                    id="btn-submit-feedback"
                  >
                    <Send className="h-4 w-4" />
                    <span>บันทึกและส่งผลประเมิน (Submit Review)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GOLD EMBOSSED CERTIFICATE MODAL */}
      {showCertCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-amber-200 relative overflow-hidden flex flex-col items-center">
            
            {/* Background design accents */}
            <div className="absolute inset-4 border bg-stone-50/50 border-double border-amber-300 rounded-2xl pointer-events-none"></div>
            <div className="absolute top-2 right-2 opacity-5 pointer-events-none">
              <Award className="h-64 w-64 text-amber-500 fill-amber-500" />
            </div>

            {/* Close Button above */}
            <button
              onClick={() => setShowCertCourse(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full transition z-10"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            {/* Certificate Header Banner */}
            <div className="text-center space-y-2 mt-4 z-10">
              <span className="text-xs font-black tracking-widest text-amber-600 block uppercase">BANGKOK UNIVERSITY ACHIEVEMENT ACCREDITATION</span>
              <h3 className="font-extrabold text-2xl text-slate-800 tracking-tight">ใบประกาศนียบัตรผ่านการฝึกอบรมพัฒนาบุคลากร</h3>
              <p className="text-[11px] text-slate-400 font-medium">สมาคมพัฒนาวิทยาการเรียนรู้ (BU-HRD)</p>
            </div>

            {/* Decorative Gold Seal / Icon */}
            <div className="my-6 z-10 flex flex-col items-center">
              <div className="bg-amber-100 border border-amber-300 p-3 rounded-full flex items-center justify-center shadow-inner relative">
                <Award className="h-10 w-10 text-amber-600 fill-amber-500/20 stroke-[1.5]" />
                <span className="absolute -bottom-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
              </div>
            </div>

            {/* Recipient Text Body */}
            <div className="text-center space-y-6 max-w-lg z-10">
              <div className="space-y-1">
                <span className="text-xs text-slate-400 block">ใบสำคัญฉบับนี้ขอรับรองและประจักษ์ว่า</span>
                <span className="text-2xl font-black text-slate-900 border-b-2 border-amber-300/60 pb-1.5 px-6 inline-block tracking-tight font-sans">
                  {userName}
                </span>
                <span className="text-xs text-slate-400 block pt-1">สังกัดงานหน่วย: {department || "บุคลากร"}</span>
              </div>

              <div className="space-y-2 text-sm text-slate-700 leading-relaxed font-semibold">
                <p>ได้ผ่านเกณฑ์เช็คอินเข้าชั้นเรียนและส่งแบบวัดสัมฤทธิ์ผลการเรียนรู้ครบถ้วน</p>
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl shadow-xs">
                  <p className="text-amber-800 text-xs font-extrabold uppercase tracking-wide">หลักสูตรสัมมนาวิชาชีพ:</p>
                  <p className="text-slate-900 font-extrabold text-base mt-1 tracking-tight leading-snug">
                    {showCertCourse.title}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">วิทยากรเจ้าผู้บรรยายโครงการ: <strong>{showCertCourse.speaker}</strong></p>
                </div>
              </div>

              <p className="text-xs text-slate-400 pt-2 font-medium">
                จัดขึ้นประเมิน ณ Bangkok University • ให้ไว้เป็นประวัติหลักฐานสะสมคุณงามต่อไป
              </p>
            </div>

            {/* Footer signatures and seal stamp */}
            <div className="grid grid-cols-2 gap-20 border-t border-slate-100 pt-8 mt-8 w-full text-center text-xs text-slate-500 z-10">
              <div className="space-y-1">
                <div className="h-6 flex items-center justify-center">
                  <span className="font-mono text-xs italic text-slate-350 select-none">BU-DIGITAL-SIGN</span>
                </div>
                <p className="font-bold text-slate-800">สำนักพัฒนากิจกรรมองค์กร</p>
                <p className="text-[10px] text-slate-400">Bangkok University HRD Center</p>
              </div>

              <div className="space-y-1">
                <div className="h-6 flex items-center justify-center">
                  <span className="font-sans font-bold text-amber-600 text-[11px] border border-amber-300 px-2 py-0.5 rounded-md select-none bg-amber-50">GOLD EMBOSSED</span>
                </div>
                <p className="font-bold text-slate-800">วิทยากรเจ้าของโครงการ</p>
                <p className="text-[10px] text-slate-400">{showCertCourse.speaker}</p>
              </div>
            </div>

            {/* Print trigger button */}
            <button
              onClick={() => {
                window.print();
              }}
              className="mt-8 bg-slate-900 hover:bg-black text-white font-bold py-2.5 px-6 rounded-xl text-xs transition duration-150 flex items-center gap-1.5 z-10 cursor-pointer shadow-md"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm0-10V4a2 2 0 012-2h4a2 2 0 012 2v4m-6 0h6 pointer-events-none" />
              </svg>
              <span>พิมพ์ใบประกาศนียบัตร (Print or PDF)</span>
            </button>
          </div>
        </div>
      )}

      {/* BEAUTIFUL REGISTRATION EMAIL CONFIRMATION MODAL */}
      {previewRegId && (
        (() => {
          const reg = validRegistrations.find(r => r.id === previewRegId);
          const course = reg ? courses.find(c => c.id === reg.courseId) : null;
          if (!reg || !course) return null;
          
          return (
            <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 relative flex flex-col" id="email-confirmation-modal">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    <div className="bg-violet-100 p-2 rounded-xl text-violet-700">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">การแจ้งเตือนยืนยันการลงทะเบียนเข้าอบรม (Email Notification)</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Automated Notification System</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setPreviewRegId(null);
                      setResendSuccess(false);
                      setResendError(null);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition cursor-pointer"
                    id="btn-close-email-modal-top"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Alert banner summarizing the result */}
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3 text-emerald-800" id="email-alert-banner">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-extrabold">ดำเนินการสำรองสิทธิ์เข้าอบรมเสร็จสิ้น!</p>
                      <p className="font-medium text-emerald-600 mt-1">
                        ระบบได้ยืนยันสิทธิ์และทำการลงทะเบียนเข้าร่วมอบรมหลักสูตรนี้เรียบร้อยแล้ว
                        {gasUrl 
                          ? " พร้อมส่งอีเมลตอบรับอัตโนมัติและส่งคำเชิญลง Google Calendar ไปยังบัญชีของท่านค่ะ"
                          : " และเนื่องจากระบบอยู่ในโหมดจัดเตรียมการบริการ จึงได้ส่งเมลจำลองตอบรับรายละเอียดแจ้งเตือนในกล่องด้านล่างนี้ทันทีค่ะ"
                        }
                      </p>
                    </div>
                  </div>

                  {/* Gmail Container Replica */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-slate-50/50" id="gmail-container-replica">
                    {/* Header Controls */}
                    <div className="bg-slate-100/85 px-4 py-2 text-[10px] text-slate-400 font-mono font-bold flex justify-between border-b border-slate-200/60">
                      <span>✉️ INCOMING EMAIL FROM SERVER</span>
                      <span>SECURE TRANSACTION VIA SSL</span>
                    </div>

                    {/* Email Meta */}
                    <div className="p-4 bg-white border-b border-slate-100 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                          <span className="font-mono text-slate-400 mr-1.5">[Subject]</span> 
                          ยืนยันการลงทะเบียน: {course.title}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-450 bg-slate-100 px-2 py-0.5 rounded font-bold w-fit sm:self-start">
                          {new Date(reg.registeredAt).toLocaleString('th-TH')}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium space-y-1">
                        <p><strong>จาก:</strong> <span className="text-slate-700 font-semibold">BU Training System &lt;noreply-training@bu.ac.th&gt;</span></p>
                        <p><strong>ถึง:</strong> <span className="text-slate-700 font-semibold">{userName} &lt;{userEmail}&gt;</span></p>
                      </div>
                    </div>

                    {/* Email Core Body Content */}
                    <div className="p-4 md:p-6 bg-white">
                      <div className="font-sans text-xs text-slate-700 space-y-4 max-w-xl mx-auto border border-slate-150 rounded-xl p-5 shadow-xs">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                          <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                          <h2 className="text-sm font-black text-emerald-600">ลงทะเบียนเข้าร่วมอบรมสำเร็จเรียบร้อยแล้ว</h2>
                        </div>
                        <p className="font-medium text-slate-600">สวัสดีคุณ <strong className="text-slate-900 font-extrabold">{userName}</strong>,</p>
                        <p className="font-medium text-slate-600">ท่านได้ลงทะเบียนเข้าร่วมอบรมหลักสูตรดังกล่าวเรียบร้อยแล้ว รายละเอียดการจัดกิจกรรมมีดังนี้:</p>
                        
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-slate-50/20 my-4">
                          <table className="w-full border-collapse text-xs">
                            <tbody>
                              <tr className="border-b border-slate-200/65 bg-slate-100/50">
                                <td className="p-2.5 font-bold text-slate-800 w-1/3">หลักสูตร</td>
                                <td className="p-2.5 font-medium text-slate-900">{course.title}</td>
                              </tr>
                              <tr className="border-b border-slate-200/65">
                                <td className="p-2.5 font-bold text-slate-800">วันที่จัดกิจกรรม</td>
                                <td className="p-2.5 font-medium text-slate-900">{course.date}</td>
                              </tr>
                              <tr className="border-b border-slate-200/65 bg-slate-100/50">
                                <td className="p-2.5 font-bold text-slate-800">เวลาจัดอบรม</td>
                                <td className="p-2.5 font-medium text-slate-900">{course.time} น.</td>
                              </tr>
                              <tr className="border-b border-slate-200/65">
                                <td className="p-2.5 font-bold text-slate-800">สถานที่</td>
                                <td className="p-2.5 font-medium text-slate-900">{course.location}</td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-bold text-slate-800">วิทยากรผู้บรรยาย</td>
                                <td className="p-2.5 font-medium text-slate-900">{course.speaker}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          ระบบได้ส่งคำเชิญลง Google Calendar สำหรับกิจกรรมสัมมนานี้ไปยังปฏิทินของท่านเรียบร้อยแล้วค่ะ กรุณากดยืนยันมีส่วนร่วมในคำเชิญที่ได้รับเพื่อบันทึกลงปฏิทินส่วนตัวของท่านโดยอัตโนมัติ
                        </p>
                        
                        <div className="border-t border-slate-150 pt-3 mt-4 text-[10px] text-slate-400 font-medium">
                          เมลนี้เป็นระบบตอบรับอัตโนมัติจาก BU Training Management System มหาวิทยาลัยกรุงเทพ
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Manual trigger to resend email */}
                  {gasUrl && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-violet-50/50 border border-violet-100 rounded-2xl p-4" id="resend-email-bar">
                      <div className="text-left text-xs">
                        <p className="font-extrabold text-violet-900">ต้องการส่งอีเมลหรือคำเชิญเข้าปฏิทิน Google อีกครั้ง?</p>
                        <p className="text-slate-500 font-medium mt-0.5">ท่านสามารถกดส่งเมลยืนยันซ้ำไปยังกล่องข้อความ {userEmail} ได้ตลอดเวลา</p>
                      </div>
                      
                      <button
                        onClick={async () => {
                          setResendingEmail(true);
                          setResendError(null);
                          setResendSuccess(false);
                          
                          const emailPayload = formatEmailPayload('register', course, userName, userEmail);

                          try {
                            await sendGasWebhook(gasUrl, emailPayload);
                            setResendSuccess(true);
                          } catch (err: any) {
                            console.error(err);
                            setResendError(err.message || 'ตรวจพบข้อผิดพลาดขณะส่งอีเมลซ้ำ');
                          } finally {
                            setResendingEmail(false);
                          }
                        }}
                        disabled={resendingEmail}
                        className="w-full sm:w-auto px-4 py-2 bg-violet-600 hover:bg-violet-750 font-bold text-white text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition duration-150 disabled:opacity-50 min-h-[44px]"
                        id="btn-resend-email"
                      >
                        {resendingEmail ? (
                          <>
                            <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            <span>กำลังจัดส่ง...</span>
                          </>
                        ) : resendSuccess ? (
                          <>
                            <Check className="h-4 w-4" />
                            <span>จัดส่งสำเร็จแล้ว!</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            <span>ส่งเมลแจ้งเตือนซ้ำ (Resend)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {resendError && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-red-800 text-xs flex gap-2" id="resend-email-error">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>{resendError}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 sticky bottom-0 rounded-b-3xl">
                  <button
                    onClick={() => {
                      setPreviewRegId(null);
                      setResendSuccess(false);
                      setResendError(null);
                    }}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer min-h-[44px]"
                    id="btn-close-email-modal-bottom"
                  >
                    ปิดหน้าต่างสัญญานี้ (Close)
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Full Poster Lightbox Modal */}
      {/* EDIT PROFILE MODAL (ADMIN ONLY) */}
      {isAdmin && isEditProfileOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
          id="modal-edit-profile"
        >
          <div 
            className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 my-8 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl border border-orange-100">
                  <Edit3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    แก้ไขข้อมูลโปรไฟล์ของฉัน
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    อัปเดตข้อมูลให้ถูกต้องตรงกับฐานข้อมูลบุคลากรมหาวิทยาลัยกรุงเทพ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                id="btn-close-edit-profile-modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveMyProfile} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Personnel ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>💳 รหัสบุคลากร</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editProfileForm.id}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, id: e.target.value })}
                    placeholder="เช่น 10502011 หรือ BUQA-001"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-hidden transition"
                    id="input-profile-id"
                  />
                  <p className="text-[10px] text-slate-400">
                    รหัสประจำตัวพนักงานตามบัตรบุคลากร
                  </p>
                </div>

                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>👤 ชื่อ-นามสกุล</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editProfileForm.name}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, name: e.target.value })}
                    placeholder="เช่น ปณิสรา ลี้สา หรือ ดร.ปณิสรา ลี้สา"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-hidden transition"
                    id="input-profile-name"
                  />
                  <p className="text-[10px] text-slate-400">
                    ชื่อภาษาไทยที่ถูกต้องสำหรับพิมพ์ในใบวุฒิบัตร
                  </p>
                </div>
              </div>

              {/* University Email (Readonly) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  ✉️ อีเมลมหาวิทยาลัย (ผูกกับบัญชีล็อกอิน)
                </label>
                <input
                  type="text"
                  disabled
                  value={cleanUserEmail}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-500 cursor-not-allowed"
                  id="input-profile-email-readonly"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Department / Faculty */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <span>🏢 หน่วยงาน / คณะ</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="bu-departments-list"
                    value={editProfileForm.department}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, department: e.target.value })}
                    placeholder="เช่น สำนักมาตรฐานคุณภาพการศึกษา"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-hidden transition"
                    id="input-profile-dept"
                  />
                  <datalist id="bu-departments-list">
                    <option value="สำนักมาตรฐานคุณภาพการศึกษา" />
                    <option value="คณะเทคโนโลยีสารสนเทศและนวัตกรรม" />
                    <option value="คณะบริหารธุรกิจ" />
                    <option value="คณะนิเทศศาสตร์" />
                    <option value="คณะมนุษยศาสตร์และการจัดการการท่องเที่ยว" />
                    <option value="คณะดิจิทัลมีเดียและศิลปะภาพยนตร์" />
                    <option value="คณะนิติศาสตร์" />
                    <option value="คณะบัญชี" />
                    <option value="คณะเศรษฐศาสตร์และการลงทุน" />
                    <option value="คณะสถาปัตยกรรมศาสตร์" />
                    <option value="คณะวิศวกรรมศาสตร์" />
                    <option value="คณะศิลปกรรมศาสตร์" />
                    <option value="วิทยาลัยนานาชาติ (BU International)" />
                    <option value="วิทยาลัยนวัตกรรมและเทคโนโลยีอนาคต" />
                    <option value="สำนักพัฒนาวิชาการ" />
                    <option value="สำนักทะเบียนและประมวลผล" />
                    <option value="สำนักหอสมุด" />
                    <option value="สำนักวิทยาการ" />
                    <option value="ศูนย์สนับสนุนและพัฒนาการเรียนการสอน (TLC)" />
                    <option value="กองการเจ้าหน้าที่" />
                  </datalist>
                </div>

                {/* Position */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    💼 ตำแหน่งงานประจำ
                  </label>
                  <input
                    type="text"
                    list="bu-positions-list"
                    value={editProfileForm.position}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, position: e.target.value })}
                    placeholder="เช่น อาจารย์ประจำ หรือ เจ้าหน้าที่บริหารงานทั่วไป"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-hidden transition"
                    id="input-profile-position"
                  />
                  <datalist id="bu-positions-list">
                    <option value="ผู้บริหารระบบ สำนักมาตรฐานคุณภาพการศึกษา" />
                    <option value="ผู้อำนวยการสำนัก" />
                    <option value="คณบดี" />
                    <option value="รองคณบดี" />
                    <option value="หัวหน้าภาควิชา" />
                    <option value="อาจารย์ประจำ" />
                    <option value="อาจารย์พิเศษ" />
                    <option value="เจ้าหน้าที่บริหารงานทั่วไป" />
                    <option value="นักวิชาการการศึกษา" />
                    <option value="เจ้าหน้าที่ประกันคุณภาพการศึกษา" />
                    <option value="เจ้าหน้าที่ประสานงาน" />
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Curriculum / Program */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    🎓 หลักสูตร / สาขาวิชา
                  </label>
                  <input
                    type="text"
                    value={editProfileForm.curriculum}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, curriculum: e.target.value })}
                    placeholder="เช่น สาขาวิชาวิทยาการคอมพิวเตอร์ หรือ -"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-hidden transition"
                    id="input-profile-curr"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    📞 เบอร์โทรศัพท์ภายใน / เบอร์ติดต่อ
                  </label>
                  <input
                    type="text"
                    value={editProfileForm.phone}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, phone: e.target.value })}
                    placeholder="เช่น 1234 หรือ 02-123-4567"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl text-xs font-semibold text-slate-800 outline-hidden transition"
                    id="input-profile-phone"
                  />
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                💡 <strong>หมายเหตุ:</strong> เมื่อท่านกดบันทึก ข้อมูลนี้จะถูกบันทึกลงในฐานข้อมูลบุคลากร และระบบจะอัปเดตประวัติการลงทะเบียนทั้งหมดของท่านให้ตรงกันโดยอัตโนมัติค่ะ
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  disabled={savingProfile}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition duration-150 cursor-pointer"
                  id="btn-cancel-edit-profile"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-xs transition duration-150 flex items-center gap-1.5 cursor-pointer"
                  id="btn-save-profile-submit"
                >
                  {savingProfile ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>กำลังบันทึกข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>บันทึกข้อมูลบุคลากร</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPosterModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedPosterModal(null)}
          id="modal-poster-lightbox"
        >
          <div 
            className="relative max-w-2xl max-h-[92vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 border-b border-slate-100 bg-white sticky top-0 z-10">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 truncate pr-4">
                🖼️ ภาพโปสเตอร์ประชาสัมพันธ์: {selectedPosterModal.title}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedPosterModal(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
                id="btn-close-poster-lightbox"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto p-3 bg-slate-900/5 flex items-center justify-center max-h-[calc(92vh-60px)]">
              <img 
                src={selectedPosterModal.url} 
                alt={selectedPosterModal.title}
                className="max-h-[84vh] w-auto max-w-full rounded-xl object-contain shadow-md"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
