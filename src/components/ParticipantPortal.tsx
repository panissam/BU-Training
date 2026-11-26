import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, getDoc, increment 
} from 'firebase/firestore';
import { 
  Calendar, MapPin, User, Users, CheckCircle2, AlertCircle, Clock, 
  ChevronRight, ArrowRight, Star, Send, QrCode as QrIcon, Camera, Search, BookOpen, LogOut, Award,
  Mail, Check, ExternalLink, Globe, Shield, Lock, Maximize2, X, ZoomIn,
  AlertTriangle
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
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'open' | 'registered'>('all');
  const [searchQueryRegs, setSearchQueryRegs] = useState('');
  const [selectedQrCourseId, setSelectedQrCourseId] = useState<string>('');
  const [selectedEvalCourseId, setSelectedEvalCourseId] = useState<string>('');
  const [showCertCourse, setShowCertCourse] = useState<Course | null>(null);
  const [brokenPosterIds, setBrokenPosterIds] = useState<Record<string, boolean>>({});
  const [cancelTarget, setCancelTarget] = useState<{ course: Course; registration: Registration } | null>(null);
  const [portalToast, setPortalToast] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!portalToast) return;
    const timer = setTimeout(() => {
      setPortalToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [portalToast]);
  
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
      setPortalToast({
        type: 'error',
        message: 'กรุณากรอกรหัสบุคลากรของท่านก่อนทำการลงทะเบียน',
      });
      return;
    }

    if (course.restrictToTargets === true) {
      if (!isUserInvitedToCourse(course.id, cleanUserEmail)) {
        setPortalToast({
          type: 'error',
          message: `ขออภัย โครงการอบรม "${course.title}" นี้เปิดให้ลงทะเบียนเฉพาะผู้ที่ได้รับอีเมลเชิญผ่านระบบเท่านั้น`,
        });
        return;
      }
    }

    if (course.registrationCloseTime && new Date() > new Date(course.registrationCloseTime)) {
      setPortalToast({
        type: 'error',
        message: 'ขออภัย ระบบได้ปิดรับการลงทะเบียนสำหรับโครงการนี้เรียบร้อยแล้ว',
      });
      return;
    }

    if (course.restrictToTargets === true) {
      if ((course.targetPositions && course.targetPositions.length > 0) || (course.targetPersonnelIds && course.targetPersonnelIds.length > 0)) {
        if (!isUserEligibleForCourse(position, personnelId, course.targetPositions, course.targetPersonnelIds)) {
          setPortalToast({
            type: 'error',
            message: `ขออภัย โครงการอบรมนี้จำกัดสิทธิ์เฉพาะกลุ่มเป้าหมายหรือรายชื่อบุคคลที่กำหนดเท่านั้น (ตำแหน่งปัจจุบัน: ${position || 'ทั่วไป'})`,
          });
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
            setPortalToast({
              type: 'error',
              message: `ขออภัย โครงการอบรมนี้มีผู้ลงทะเบียนเต็มจำนวนที่นั่งเรียบร้อยแล้ว (${latestCourse.maxSeats} ที่นั่ง)`,
            });
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
          setPortalToast({
            type: 'success',
            message: `ลงทะเบียน "${course.title}" สำเร็จ ระบบได้ส่งอีเมลยืนยันและคำเชิญลง Google Calendar ให้ท่านเรียบร้อยแล้ว`,
          });
        } catch (gasErr: any) {
          console.error('GAS registration hook connection failed:', gasErr);
          setPortalToast({
            type: 'warning',
            message: `ลงทะเบียน "${course.title}" สำเร็จแล้ว แต่ไม่สามารถส่งอีเมลยืนยันได้ (${gasErr.message || 'โปรดตรวจสอบโควต้าอีเมล'})`,
          });
        }
      } else {
        // Simulation log for debugging
        console.warn('--- REGISTRATION EMAIL & CALENDAR SIMULATION (No GAS App URL provided) ---');
        console.warn(`Sent registration confirmation and Google Calendar invitation to ${cleanUserEmail} for "${course.title}"`);
        setPortalToast({
          type: 'success',
          message: `ลงทะเบียน "${course.title}" สำเร็จเรียบร้อยแล้ว (โหมดจำลองการส่งอีเมล)`,
        });
      }

      setSelectedCourse(null);
    } catch (err) {
      console.error(err);
      setPortalToast({
        type: 'error',
        message: 'เกิดข้อผิดพลาดในการลงทะเบียน โปรดลองอีกครั้ง',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Cancels a seat registration
  const handleCancelRegistration = async (course: Course, registration: Registration) => {
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, 'registrations', registration.id));
      if ((course.registeredCount || 0) > 0) {
        await updateDoc(doc(db, 'courses', course.id), {
          registeredCount: increment(-1),
        });
      }
      setCancelTarget(null);
      setPortalToast({
        type: 'success',
        message: `ยกเลิกการลงทะเบียนหลักสูตร "${course.title}" เรียบร้อยแล้ว`,
      });
    } catch (err: any) {
      console.error('Cancel registration error:', err);
      const isPermDenied =
        err?.code === 'permission-denied' ||
        String(err?.message || '').toLowerCase().includes('permission');
      setCancelTarget(null);
      setPortalToast({
        type: 'error',
        message: isPermDenied
          ? 'สิทธิ์ปัจจุบันไม่สามารถยกเลิกการลงทะเบียนได้โดยตรง กรุณาติดต่อสำนักมาตรฐานคุณภาพการศึกษา (buqa@bu.ac.th)'
          : `ไม่สามารถยกเลิกการลงทะเบียนได้: ${err?.message || 'โปรดลองใหม่อีกครั้ง'}`,
      });
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
  const visibleCourses = courses.filter(c => c.visible !== false && c.archived !== true);
  const filteredCourses = visibleCourses.filter(c => {
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.speaker.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const isReg = validRegistrations.some(r => r.courseId === c.id);
    if (catalogFilter === 'registered') return isReg;
    if (catalogFilter === 'open') {
      const closed = c.registrationCloseTime ? (new Date() > new Date(c.registrationCloseTime)) : false;
      const full = c.maxSeats ? ((c.registeredCount || 0) >= c.maxSeats) : false;
      return !closed && !full && !isReg;
    }
    return true;
  });

  const checkedInCount = validRegistrations.filter(r => r.checkedIn).length;
  const feedbackCompletedCount = validRegistrations.filter(r => r.feedback).length;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6" id="participant-portal">
      {/* Featured Royal Navy Header & Metric Highlight Banner */}
      <section className="bg-[#071A4B] text-white rounded-3xl p-6 md:p-8 shadow-lg border border-white/10 border-b-2 border-b-[#F97316] mb-8 space-y-6" id="portal-header-banner">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-white/10 pb-6" id="portal-header">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2.5">
              <span className="inline-block w-5 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
              <span>BANGKOK UNIVERSITY · STAFF TRAINING PORTAL</span>
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
              ระบบบริหารจัดการการอบรม{' '}
              <span className="text-[#F97316]">สำนักมาตรฐานคุณภาพการศึกษา</span>
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 font-medium" id="user-display-meta">
              เพื่อยกระดับและขับเคลื่อนการประกันคุณภาพตามเกณฑ์ EdPEx และ AUN-QA version 4.0
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 border border-white/15 bg-[#0D2566] text-white hover:bg-[#F97316] hover:border-[#F97316] px-5 py-2.5 rounded-full text-xs sm:text-sm transition duration-150 min-h-[44px] font-bold cursor-pointer shadow-xs"
              id="btn-portal-logout"
            >
              <LogOut className="h-4 w-4 text-[#F97316] group-hover:text-white" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </header>

        {/* High-Contrast Metric Highlight Strip inside Royal Navy Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="portal-metric-strip">
          <div className="bg-[#0D2566] text-white rounded-2xl p-5 border border-white/10 border-b-2 border-b-[#F97316] flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
                หลักสูตรเปิดอบรม
              </p>
              <div className="text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums text-white">
                {visibleCourses.length} <span className="text-sm font-semibold text-slate-300">หลักสูตร</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#F97316] text-white flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white rounded-2xl p-5 border border-white/10 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-100">
                ลงทะเบียนของฉัน
              </p>
              <div className="text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums">
                {validRegistrations.length} <span className="text-sm font-semibold text-orange-100">หลักสูตร</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-[#F97316]" />
            </div>
          </div>

          <div className="bg-[#0D2566] text-white rounded-2xl p-5 border border-white/10 border-b-2 border-b-[#F97316] flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
                เข้าเช็คอินสำเร็จ
              </p>
              <div className="text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums text-white">
                {checkedInCount} <span className="text-sm font-semibold text-slate-300">หลักสูตร</span>
              </div>
            </div>
            <div className="w-11 h-11 rounded-full bg-[#071A4B] border border-white/15 text-[#F97316] flex items-center justify-center shrink-0">
              <Award className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* INSTRUCTOR PROFILE CARD - WITH INTERACTIVE EDITING & DATA VERIFICATION */}
      <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] rounded-2xl p-6 shadow-sm mb-8 relative overflow-hidden" id="instructor-profile-card">
        {/* Header with Title and Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-4">
            <div className="bg-[#071A4B] rounded-full flex items-center justify-center text-white w-12 h-12 shrink-0 shadow-xs">
              <User className="h-6 w-6 stroke-[1.75] text-[#F97316]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#EA580C]">Personnel Profile</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-extrabold text-[#071A4B] tracking-tight">
                  ข้อมูล<span className="text-[#F97316]">โปรไฟล์บุคลากร</span>
                </h2>
                {hasDbProfile ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>VERIFIED PROFILE</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[10px] uppercase tracking-wider bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span>UNSYNCED</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                ข้อมูลส่วนบุคคลสำหรับใช้ในการลงทะเบียน ออกใบวุฒิบัตร และจัดทำสถิติรายงานการอบรม
              </p>
            </div>
          </div>
        </div>

        {/* 6 Grid Field Displays */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              รหัสบุคลากร
            </label>
            <div className="w-full bg-[#F5F7FA] border border-[#E2E8F0] px-4 py-3 rounded-xl text-[#071A4B] font-bold text-sm tracking-wide flex items-center justify-between tabular-nums">
              <span>{personnelId || 'ยังไม่ได้ระบุ'}</span>
              {!hasDbProfile && personnelId.startsWith('BU-8') && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">ชั่วคราว</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              ชื่อ-นามสกุล
            </label>
            <div className="w-full bg-[#F5F7FA] border border-[#E2E8F0] px-4 py-3 rounded-xl text-[#071A4B] font-bold text-sm">
              {profileName || userName}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              อีเมลมหาวิทยาลัย
            </label>
            <div className="w-full bg-[#F5F7FA] border border-[#E2E8F0] px-4 py-3 rounded-xl text-[#071A4B] font-semibold text-sm font-mono truncate">
              {userEmail}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              หน่วยงาน / คณะ
            </label>
            <div className="w-full bg-[#F5F7FA] border border-[#E2E8F0] px-4 py-3 rounded-xl text-[#071A4B] font-bold text-sm truncate">
              {department || 'สำนักมาตรฐานคุณภาพการศึกษา'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              ตำแหน่งงานประจำ
            </label>
            <div className="w-full bg-[#F5F7FA] border border-[#E2E8F0] px-4 py-3 rounded-xl text-[#071A4B] font-bold text-sm truncate">
              {position || 'บุคลากรทั่วไป'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              หลักสูตร / ภาควิชา
            </label>
            <div className="w-full bg-[#F5F7FA] border border-[#E2E8F0] px-4 py-3 rounded-xl text-[#071A4B] font-medium text-sm truncate">
              {curriculum && curriculum !== '-' ? curriculum : (academicDepartment && academicDepartment !== '-' ? academicDepartment : '-')}
            </div>
          </div>
        </div>

        {/* Dynamic Status / Action Guidance Banner */}
        {hasDbProfile ? (
          <div className="bg-[#F5F7FA] border border-[#E2E8F0] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-700">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>ข้อมูลโปรไฟล์ของท่านได้รับการยืนยันและซิงค์กับฐานข้อมูลบุคลากรมหาวิทยาลัยกรุงเทพเรียบร้อยแล้ว</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              (ระบบจำกัดสิทธิ์เฉพาะแอดมินในการแก้ไขข้อมูล)
            </span>
          </div>
        ) : (
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-amber-900 font-bold leading-relaxed">
                * ข้อมูลโปรไฟล์ถูกซิงค์จากฐานข้อมูลบุคลากรทางการ
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                หากข้อมูลของท่านไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ (Admin) หรือสำนักมาตรฐานคุณภาพการศึกษา เพื่อดำเนินการปรับปรุงข้อมูลในฐานระบบ
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Menu */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-1.5 flex flex-wrap gap-1.5 mb-8 shadow-xs w-fit max-w-full" id="portal-tabs">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2.5 rounded-full font-bold text-xs sm:text-sm transition duration-150 min-h-[42px] cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[#071A4B] text-white shadow-xs'
              : 'text-[#071A4B] hover:bg-slate-100'
          }`}
          id="tab-catalog"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>หลักสูตรการอบรมทั้งหมด</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] tabular-nums font-extrabold ${
              activeTab === 'catalog' ? 'bg-[#F97316] text-white' : 'bg-slate-100 text-[#071A4B]'
            }`}>
              {courses.length}
            </span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('registrations')}
          className={`px-4 py-2.5 rounded-full font-bold text-xs sm:text-sm transition duration-150 min-h-[42px] cursor-pointer ${
            activeTab === 'registrations'
              ? 'bg-[#071A4B] text-white shadow-xs'
              : 'text-[#071A4B] hover:bg-slate-100'
          }`}
          id="tab-registrations"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span>ตรวจสอบสถานะการอบรมของฉัน</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] tabular-nums font-extrabold ${
              activeTab === 'registrations' ? 'bg-[#F97316] text-white' : 'bg-slate-100 text-[#071A4B]'
            }`}>
              {validRegistrations.length}
            </span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('evaluation')}
          className={`px-4 py-2.5 rounded-full font-bold text-xs sm:text-sm transition duration-150 min-h-[42px] cursor-pointer ${
            activeTab === 'evaluation'
              ? 'bg-[#071A4B] text-white shadow-xs'
              : 'text-[#071A4B] hover:bg-slate-100'
          }`}
          id="tab-evaluation"
        >
          <div className="flex items-center gap-2">
            <Star className={`h-4 w-4 ${activeTab === 'evaluation' ? 'fill-[#F97316] text-[#F97316]' : 'text-slate-500'}`} />
            <span>ทำแบบประเมินความพึงพอใจ</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] tabular-nums font-extrabold ${
              activeTab === 'evaluation'
                ? 'bg-[#F97316] text-white'
                : pendingFeedbackCount > 0
                  ? 'bg-orange-100 text-[#EA580C]'
                  : 'bg-slate-100 text-[#071A4B]'
            }`}>
              {pendingFeedbackCount}
            </span>
          </div>
        </button>
      </div>

      {/* TABS CONTAINER */}
      {loading ? (
        <div className="flex flex-col space-y-6" aria-label="กำลังโหลดข้อมูลหลักสูตร">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 md:p-6 flex flex-col md:flex-row gap-6 md:gap-8"
            >
              <div className="w-full md:w-[32%] lg:w-[30%] shrink-0">
                <div className="aspect-[3/4] w-full bg-slate-100 rounded-2xl animate-pulse" />
              </div>
              <div className="flex-1 flex flex-col justify-between space-y-4 py-1">
                <div className="space-y-3">
                  <div className="h-7 bg-slate-100 rounded-xl w-3/4 animate-pulse" />
                  <div className="h-4 bg-slate-100 rounded-lg w-full animate-pulse" />
                  <div className="h-4 bg-slate-100 rounded-lg w-5/6 animate-pulse" />
                  <div className="h-4 bg-slate-100 rounded-lg w-44 animate-pulse mt-3" />
                  <div className="h-24 bg-[#FFF8F6] border border-orange-100/80 rounded-2xl w-full animate-pulse my-4" />
                  <div className="h-4 bg-slate-100 rounded-lg w-48 animate-pulse" />
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <div className="h-11 bg-slate-100 rounded-full w-48 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'catalog' ? (
        /* CATALOG TAB */
        <div>
          {/* Search & Outline Pill Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6" id="search-section">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาตามชื่อหลักสูตรอบรม หรือชื่อวิทยากร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#E2E8F0] text-[#071A4B] py-3 pl-11 pr-4 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition shadow-xs"
                id="input-catalog-search"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCatalogFilter('all')}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition cursor-pointer ${
                  catalogFilter === 'all'
                    ? 'bg-[#071A4B] border-[#071A4B] text-white'
                    : 'bg-white border-[#E2E8F0] text-[#071A4B] hover:border-[#071A4B] hover:bg-slate-50'
                }`}
                id="filter-catalog-all"
              >
                ทั้งหมด ({visibleCourses.length})
              </button>
              <button
                type="button"
                onClick={() => setCatalogFilter('open')}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition cursor-pointer ${
                  catalogFilter === 'open'
                    ? 'bg-[#071A4B] border-[#071A4B] text-white'
                    : 'bg-white border-[#E2E8F0] text-[#071A4B] hover:border-[#071A4B] hover:bg-slate-50'
                }`}
                id="filter-catalog-open"
              >
                เปิดลงทะเบียน
              </button>
              <button
                type="button"
                onClick={() => setCatalogFilter('registered')}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition cursor-pointer ${
                  catalogFilter === 'registered'
                    ? 'bg-[#071A4B] border-[#071A4B] text-white'
                    : 'bg-white border-[#E2E8F0] text-[#071A4B] hover:border-[#071A4B] hover:bg-slate-50'
                }`}
                id="filter-catalog-registered"
              >
                ลงทะเบียนแล้ว ({validRegistrations.length})
              </button>
            </div>
          </div>

          <div className="flex flex-col space-y-6" id="course-list-grid">
            {filteredCourses.length === 0 ? (
              <div className="py-16 text-center text-slate-500 bg-white border border-dashed border-[#E2E8F0] rounded-3xl">
                <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-sm text-[#071A4B]">ไม่พบหลักสูตรอบรมที่ตรงกับเงื่อนไขการค้นหา</p>
                <p className="text-xs text-slate-400 mt-1">ลองปรับคำค้นหาหรือเลือกตัวกรองทั้งหมดด้านบน</p>
              </div>
            ) : (
              filteredCourses.map((course) => {
                const isRegistered = validRegistrations.some(r => r.courseId === course.id);
                const regInfo = validRegistrations.find(r => r.courseId === course.id);
                const isRegClosed = course.registrationCloseTime ? (new Date() > new Date(course.registrationCloseTime)) : false;
                const isFull = course.maxSeats ? ((course.registeredCount || 0) >= course.maxSeats) : false;
                const hasValidPoster = Boolean(course.posterUrl && !brokenPosterIds[course.id]);
                const remainingSeats = course.maxSeats && course.maxSeats > 0
                  ? Math.max(0, course.maxSeats - (course.registeredCount || 0))
                  : null;
                const isRestrictedRole = course.restrictToTargets === true &&
                  ((course.targetPositions && course.targetPositions.length > 0) || (course.targetPersonnelIds && course.targetPersonnelIds.length > 0)) &&
                  !isUserEligibleForCourse(position, personnelId, course.targetPositions, course.targetPersonnelIds);
                const isUninvited = course.restrictToTargets === true && !isUserInvitedToCourse(course.id, cleanUserEmail);

                return (
                  <article
                    key={course.id}
                    className={`bg-white rounded-3xl border shadow-sm p-5 md:p-6 flex flex-col md:flex-row gap-6 md:gap-8 hover:shadow-md transition-all duration-200 ${
                      isRegistered
                        ? 'border-[#071A4B]/20 ring-1 ring-[#F97316]/15'
                        : 'border-slate-200/80 hover:border-[#071A4B]/30'
                    }`}
                    id={`card-course-${course.id}`}
                  >
                    {/* Left Column: Prominent Vertical Poster Showcase */}
                    <div className="w-full md:w-[32%] lg:w-[30%] shrink-0">
                      <div
                        className={`relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/70 select-none ${
                          hasValidPoster ? 'cursor-pointer group' : ''
                        }`}
                        onClick={() => {
                          if (hasValidPoster && course.posterUrl) {
                            setSelectedPosterModal({ url: course.posterUrl, title: course.title });
                          }
                        }}
                        title={hasValidPoster ? 'คลิกเพื่อดูภาพโปสเตอร์ขนาดเต็ม' : undefined}
                        id={`banner-poster-${course.id}`}
                      >
                        {hasValidPoster && course.posterUrl ? (
                          <>
                            <img
                              src={course.posterUrl}
                              alt={course.title}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenPosterIds((prev) => ({ ...prev, [course.id]: true }))
                              }
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#071A4B]/80 via-[#071A4B]/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-start p-3 pointer-events-none">
                              <span className="text-[11px] font-bold text-white bg-[#071A4B]/90 backdrop-blur-xs px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                <Maximize2 className="h-3 w-3 text-[#F97316]" />
                                <span>ดูภาพโปสเตอร์เต็ม</span>
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#071A4B] via-[#0A2463] to-[#0D2566] text-white p-6 flex flex-col items-center justify-center text-center relative">
                            <div className="w-14 h-14 rounded-2xl bg-[#F97316] text-white flex items-center justify-center mb-4 shadow-md">
                              <BookOpen className="h-6 w-6" />
                            </div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#F97316]">
                              BU TRAINING
                            </span>
                            <p className="font-bold text-white text-base sm:text-lg mt-2.5 line-clamp-3 leading-snug max-w-[240px]">
                              {course.title}
                            </p>
                          </div>
                        )}

                        {/* Top-Left Overlay Status Pill Badge */}
                        <div className="absolute top-3 left-3 pointer-events-none">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold text-white shadow-sm ${
                              isRegistered
                                ? 'bg-emerald-600'
                                : isFull || isRegClosed
                                ? 'bg-slate-600'
                                : 'bg-[#F97316]'
                            }`}
                          >
                            {isRegistered ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>ลงทะเบียนแล้ว</span>
                              </>
                            ) : isFull ? (
                              <span>ที่นั่งเต็มแล้ว</span>
                            ) : isRegClosed ? (
                              <span>ปิดรับลงทะเบียน</span>
                            ) : (
                              <span>เปิดรับลงทะเบียน</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Comprehensive Course Details & Direct Action */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        {/* Title & Description */}
                        <h3
                          className="text-xl md:text-2xl font-bold text-[#071A4B] leading-snug tracking-tight"
                          id={`title-course-${course.id}`}
                        >
                          {course.title}
                        </h3>

                        {course.description && course.description.trim() !== '' && (
                          <p className="text-slate-600 text-sm md:text-base leading-relaxed mt-2.5 line-clamp-4">
                            {course.description}
                          </p>
                        )}

                        {/* Instructor Row */}
                        <div className="flex items-center gap-2 text-sm text-slate-700 font-medium mt-4">
                          <User className="h-4 w-4 text-[#071A4B] shrink-0" />
                          <span>
                            วิทยากร: <strong className="text-[#071A4B] font-semibold">{course.speaker}</strong>
                          </span>
                        </div>

                        {/* Soft Warm Tinted Highlight Info Box */}
                        <div className="bg-[#FFF8F6] border border-orange-100/80 rounded-2xl p-4 my-4 space-y-2.5">
                          <div className="flex items-start gap-2.5 text-sm text-[#071A4B]">
                            <Calendar className="h-4 w-4 text-[#F97316] shrink-0 mt-0.5" />
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                              <span className="font-bold">วันที่อบรม: {course.date}</span>
                              <span className="text-slate-400" aria-hidden="true">·</span>
                              <span className="text-slate-700 font-medium">เวลา: {course.time} น.</span>
                            </div>
                          </div>

                          <div className="flex items-start gap-2.5 text-sm text-slate-700">
                            <MapPin className="h-4 w-4 text-[#071A4B] shrink-0 mt-0.5" />
                            <span>
                              สถานที่: <strong className="text-[#071A4B] font-semibold">{course.location}</strong>
                            </span>
                          </div>

                          {course.registrationCloseTime && (
                            <div className="flex items-start gap-2.5 text-xs text-slate-600 tabular-nums pt-0.5">
                              <Clock className="h-3.5 w-3.5 text-[#F97316] shrink-0 mt-0.5" />
                              <span>
                                ปิดรับลงทะเบียน: {new Date(course.registrationCloseTime).toLocaleString('th-TH')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Seat Availability & Optional Eligibility */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                          <div className="flex items-center gap-2 tabular-nums">
                            <Users className="h-4 w-4 text-[#071A4B] shrink-0" />
                            {course.maxSeats && course.maxSeats > 0 ? (
                              <span>
                                ที่นั่งว่าง:{' '}
                                <strong className={`font-bold ${isFull ? 'text-rose-600' : 'text-[#EA580C]'}`}>
                                  {remainingSeats}
                                </strong>{' '}
                                / <strong className="text-[#071A4B] font-semibold">{course.maxSeats}</strong> ที่นั่ง
                                <span className="text-xs text-slate-500 ml-2">
                                  (ลงทะเบียนแล้ว {course.registeredCount || 0} คน)
                                </span>
                              </span>
                            ) : (
                              <span>
                                ผู้ลงทะเบียนแล้ว:{' '}
                                <strong className="text-[#EA580C] font-bold">{course.registeredCount || 0}</strong> ที่นั่ง
                                <span className="text-xs text-slate-500 ml-2">(ไม่จำกัดจำนวน)</span>
                              </span>
                            )}
                          </div>

                          {course.restrictToTargets === true &&
                            course.targetPositions &&
                            course.targetPositions.length > 0 && (
                              <span className="text-xs text-slate-500 font-medium">
                                เฉพาะ: {course.targetPositions.join(' · ')}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Bottom-Right Action Area */}
                      <div
                        className="flex flex-wrap items-center justify-end gap-3 mt-5 pt-4 border-t border-slate-100"
                        id={isRegistered ? `actions-reg-${course.id}` : undefined}
                      >
                        {isRegistered ? (
                          regInfo?.checkedIn ? (
                            <>
                              {!regInfo.feedback && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedEvalCourseId(course.id);
                                    setActiveTab('evaluation');
                                  }}
                                  className="bg-[#F97316] hover:bg-[#EA580C] text-white font-bold px-5 py-2.5 rounded-full text-xs sm:text-sm transition duration-150 shadow-xs inline-flex items-center gap-2 min-h-[42px] cursor-pointer whitespace-nowrap shrink-0"
                                  id={`btn-evaluate-${course.id}`}
                                >
                                  <Star className="h-4 w-4" />
                                  <span>ทำแบบประเมินความพึงพอใจ</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setShowCertCourse(course)}
                                className="bg-[#071A4B] hover:bg-[#0D2566] text-white font-bold pl-5 pr-2.5 py-2 rounded-full text-xs sm:text-sm transition duration-150 shadow-xs inline-flex items-center gap-3 min-h-[42px] cursor-pointer whitespace-nowrap shrink-0"
                                id={`btn-complete-feedback-${course.id}`}
                              >
                                <span className="flex items-center gap-2">
                                  <Award className="h-4 w-4 text-[#F97316]" />
                                  <span>เข้าเรียนสำเร็จแล้ว • ดูวุฒิบัตร</span>
                                </span>
                                <span className="w-7 h-7 rounded-full bg-[#F97316] text-white flex items-center justify-center shrink-0">
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </span>
                              </button>
                            </>
                          ) : (
                            <>
                              {regInfo && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewRegId(regInfo.id)}
                                  className="text-xs font-semibold text-[#071A4B] hover:text-[#EA580C] hover:underline px-3 py-2 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  ดูอีเมลยืนยันการลงทะเบียน
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (regInfo) {
                                    setCancelTarget({ course, registration: regInfo });
                                  }
                                }}
                                disabled={submitting}
                                className="border border-rose-200 text-rose-600 hover:bg-rose-50 bg-white rounded-xl px-5 py-2.5 text-sm font-medium transition duration-150 min-h-[42px] inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                                id={`btn-cancel-reg-${course.id}`}
                              >
                                <span>ยกเลิกการลงทะเบียน</span>
                                <span aria-hidden="true">✕</span>
                              </button>
                            </>
                          )
                        ) : isRegClosed ? (
                          <button
                            type="button"
                            disabled={true}
                            className="bg-[#F5F7FA] border border-[#E2E8F0] text-slate-400 font-bold px-6 py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap shrink-0"
                            id={`btn-enroll-closed-${course.id}`}
                          >
                            <AlertCircle className="h-4 w-4 text-slate-400" />
                            <span>ปิดรับลงทะเบียนแล้ว</span>
                          </button>
                        ) : isFull ? (
                          <button
                            type="button"
                            disabled={true}
                            className="bg-rose-50 border border-rose-200 text-rose-700 font-bold px-6 py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap shrink-0"
                            id={`btn-enroll-full-${course.id}`}
                          >
                            <AlertCircle className="h-4 w-4 text-rose-600" />
                            <span>ที่นั่งเต็มแล้ว</span>
                          </button>
                        ) : isRestrictedRole ? (
                          <button
                            type="button"
                            disabled={true}
                            className="bg-[#F5F7FA] border border-[#E2E8F0] text-slate-500 font-bold px-6 py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap shrink-0"
                            id={`btn-enroll-restricted-${course.id}`}
                          >
                            <Lock className="h-4 w-4 text-slate-400" />
                            <span>เฉพาะกลุ่มเป้าหมาย / บุคคลที่กำหนด</span>
                          </button>
                        ) : isUninvited ? (
                          <button
                            type="button"
                            disabled={true}
                            className="bg-[#F5F7FA] border border-[#E2E8F0] text-slate-500 font-bold px-6 py-2.5 rounded-full text-xs sm:text-sm inline-flex items-center justify-center gap-2 min-h-[44px] whitespace-nowrap shrink-0"
                            id={`btn-enroll-uninvited-${course.id}`}
                          >
                            <Mail className="h-4 w-4 text-slate-400" />
                            <span>ลงทะเบียนเฉพาะผู้ที่ได้รับอีเมลเชิญ</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRegister(course)}
                            disabled={submitting}
                            className="bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-white font-bold pl-6 pr-2.5 py-2 rounded-full text-sm transition duration-150 inline-flex items-center gap-3 min-h-[44px] shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                            id={`btn-enroll-${course.id}`}
                          >
                            <span>ลงทะเบียนเข้าร่วมอบรม</span>
                            <span className="w-7 h-7 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0">
                              <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
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
              <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] rounded-2xl p-5 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">ลงทะเบียนทั้งหมด</p>
                  <h4 className="text-2xl font-extrabold text-[#071A4B] mt-1 tabular-nums">{validRegistrations.length} หลักสูตร</h4>
                </div>
                <div className="w-11 h-11 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5 text-[#F97316]" />
                </div>
              </div>
              <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] rounded-2xl p-5 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">เข้าเช็คอินแล้ว</p>
                  <h4 className="text-2xl font-extrabold text-[#071A4B] mt-1 tabular-nums">{checkedInCount} หลักสูตร</h4>
                </div>
                <div className="w-11 h-11 rounded-full bg-[#F97316] text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="bg-[#071A4B] text-white border border-white/10 border-b-2 border-b-[#F97316] rounded-2xl p-5 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">ทำแบบประเมินเสร็จสิ้น</p>
                  <h4 className="text-2xl font-extrabold text-white mt-1 tabular-nums">{feedbackCompletedCount} หลักสูตร</h4>
                </div>
                <div className="w-11 h-11 rounded-full bg-[#0D2566] border border-white/15 text-[#F97316] flex items-center justify-center shrink-0">
                  <Star className="h-5 w-5" />
                </div>
              </div>
            </div>

          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm overflow-hidden" id="training-history-table">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#EA580C]">MY REGISTRATIONS</span>
                </div>
                <h2 className="text-xl font-extrabold text-[#071A4B] flex items-center gap-2 mt-0.5">
                  <span>รายชื่อหลักสูตรที่คุณลงทะเบียน <span className="text-[#F97316]">(ตรวจสอบสถานะ)</span></span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">ท่านสามารถติดตามเช็คอินและประเมินผลสัมมนาสำหรับวิชาที่ลงทะเบียนแล้วได้ที่นี่</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อโครงการที่ลงทะเบียน..."
                  value={searchQueryRegs}
                  onChange={(e) => setSearchQueryRegs(e.target.value)}
                  className="w-full bg-[#F5F7FA] border border-[#E2E8F0] text-[#071A4B] pl-10 pr-4 py-2.5 rounded-full text-xs focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] focus:outline-none transition-all"
                />
              </div>
            </div>

            {validRegistrations.length === 0 ? (
              <div className="text-center py-16 text-slate-500 border border-dashed border-[#E2E8F0] rounded-2xl bg-[#F5F7FA]">
                ท่านยังไม่มีประวัติการลงทะเบียนอบรมสัมมนาในระบบ หากต้องการสำรองที่นั่งกรุณากดแท็บ "หลักสูตรการอบรมทั้งหมด" ด้านบน
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm text-slate-600">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-500 uppercase text-[11px] tracking-wider">
                      <th className="py-3 px-4 font-bold pb-4">ชื่อหลักสูตรอบรม</th>
                      <th className="py-3 px-4 font-bold pb-4">วิทยากร</th>
                      <th className="py-3 px-4 font-bold pb-4 text-center">สถานะเช็คอิน</th>
                      <th className="py-3 px-4 font-bold pb-4 text-center">การทำแบบประเมินความพึงพอใจ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]/70">
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
                          <tr key={reg.id} className="hover:bg-[#F5F7FA] transition duration-150">
                            <td className="py-3.5 px-4 font-bold text-[#071A4B] max-w-sm">
                              {matchedCourse?.title || reg.courseId}
                              <div className="flex flex-wrap gap-2 items-center mt-1.5">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide bg-[#F5F7FA] border border-[#E2E8F0] px-2 py-0.5 rounded-full w-fit tabular-nums">
                                  ID: {reg.courseId}
                                </p>
                                <button
                                  onClick={() => setPreviewRegId(reg.id)}
                                  className="text-[11px] text-[#EA580C] hover:text-[#F97316] hover:underline font-bold cursor-pointer"
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
                                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1.5 border border-emerald-200 rounded-full">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  เช็คอินสำเร็จ
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 text-xs font-bold px-3 py-1.5 border border-amber-200 rounded-full">
                                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                                  ยังไม่ได้เช็คอิน
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-xs">
                              {reg.feedback ? (
                                <div className="flex flex-col items-center gap-1.5">
                                  <span className="text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 inline-flex items-center gap-1 font-bold">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>ทำแบบประเมินแล้ว</span>
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (matchedCourse) {
                                        setShowCertCourse(matchedCourse);
                                      }
                                    }}
                                    className="text-[11px] text-[#071A4B] hover:text-[#EA580C] font-bold flex items-center gap-1 cursor-pointer underline underline-offset-2"
                                  >
                                    <Award className="h-3.5 w-3.5 text-[#F97316]" />
                                    <span>พิมพ์วุฒิบัตร</span>
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
                                      className="pl-4 pr-2 py-1.5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-full text-xs font-bold transition flex items-center gap-2 shadow-xs min-h-[38px] mx-auto cursor-pointer"
                                    >
                                      <span>ทำแบบประเมินความพึงพอใจ</span>
                                      <span className="w-6 h-6 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                                        <ArrowRight className="h-3 w-3" />
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="flex flex-col items-center gap-1">
                                      <button
                                        disabled
                                        className="px-4 py-1.5 bg-[#F5F7FA] text-slate-400 border border-[#E2E8F0] rounded-full text-xs font-bold flex items-center gap-1.5 cursor-not-allowed mx-auto"
                                        title="กรุณาเช็คอินเข้าร่วมอบรมก่อนเพื่อทำแบบประเมิน"
                                      >
                                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                                        <span>ทำแบบประเมินความพึงพอใจ</span>
                                      </button>
                                      <span className="text-[10px] text-rose-600 font-semibold">กรุณาสแกนเช็คอินก่อนทำแบบประเมิน</span>
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-[#E2E8F0] hover:border-[#071A4B] rounded-full text-[#071A4B] font-bold text-xs shadow-xs transition duration-150 cursor-pointer"
          >
            ← ย้อนกลับไปรายงานข้อมูลการลงทะเบียนของฉัน
          </button>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="qr-checkin-tab-view">
          {/* Personal Digital ID Passcard */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full bg-[#071A4B] text-white rounded-3xl p-8 shadow-lg border border-white/10 border-b-2 border-b-[#F97316] relative overflow-hidden flex flex-col justify-between aspect-[3/4.5] max-w-sm mx-auto">
              
              {/* Branding header */}
              <div className="flex justify-between items-start border-b border-white/15 pb-4">
                <div>
                  <h3 className="text-[#F97316] font-extrabold text-[12px] uppercase tracking-widest">BANGKOK UNIVERSITY</h3>
                  <p className="text-[9px] text-slate-300 font-semibold tracking-wide uppercase">Short Training Digital Passport ID</p>
                </div>
                <div className="bg-[#0D2566] border border-[#F97316]/50 text-[#F97316] font-bold text-[9px] py-1 px-2.5 rounded-full font-mono">
                  STAFF ACTIVE
                </div>
              </div>

              {/* Avatar Circle and Profile Description */}
              <div className="flex flex-col items-center text-center my-6 space-y-3">
                <div className="w-20 h-20 bg-[#F97316] rounded-full flex items-center justify-center text-white font-extrabold shadow-sm">
                  <User className="h-10 w-10 stroke-[1.5]" />
                </div>
                <div>
                  <h4 className="text-lg font-extrabold tracking-tight text-white">{userName}</h4>
                  <p className="text-xs text-slate-300 mt-0.5">{department}</p>
                </div>
                <p className="text-[10px] font-bold text-slate-200 font-mono tracking-wider bg-[#0D2566] px-3 py-1 rounded-full border border-white/15 tabular-nums">
                  ID: {personnelId || "กำลังประเมินรหัส..."}
                </p>
              </div>

              {/* Dynamic scannable QR code */}
              <div className="p-3 bg-white rounded-2xl self-center mx-auto mb-4 border border-[#E2E8F0] flex flex-col items-center justify-center shadow-md">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`BU_STAFF_ID:${personnelId || 'PENDING'}|EMAIL:${cleanUserEmail || ''}`)}`}
                  alt="Staff QR Passport Code"
                  className="w-36 h-36 rounded-xl object-contain bg-white border border-slate-100 p-1"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="text-center">
                <p className="text-[10px] text-slate-300 leading-snug">
                  * ให้เจ้าหน้าที่ส่วนกลางสแกนรหัสนี้เพื่อยืนยันสถานะเข้าร่วมกิจกรรมได้ในทันที
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Self Scanner Side */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#F97316] text-white flex items-center justify-center shrink-0">
                  <QrIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#EA580C]">SELF CHECK-IN</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-[#071A4B] mt-0.5">
                    สแกนยืนยันการเช็คอินด้วยตนเอง <span className="text-[#F97316]">(Self Check-In)</span>
                  </h2>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                หากท่านเดินทางมาเข้าร่วมโครงการอบรมหน้างานสัมมนาแล้ว ท่านสามารถเลือกรายการอบรมที่ลงทะเบียนไว้เพื่อสแกนยืนยันตนเข้าอบรมได้ทันที
              </p>

              {/* Course Selector Dropdown */}
              <div className="space-y-2 mb-6">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">
                  เลือกหลักสูตรที่คุณลงทะเบียนไว้ (ที่รอเช็คอิน)
                </label>
                <select
                  value={selectedQrCourseId}
                  onChange={(e) => {
                    setSelectedQrCourseId(e.target.value);
                    setCheckInError('');
                  }}
                  className="w-full bg-white border border-[#E2E8F0] p-3 rounded-xl text-[#071A4B] font-bold text-sm focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] focus:outline-none cursor-pointer"
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
                      <div className="bg-[#F5F7FA] rounded-2xl p-4 border border-[#E2E8F0] text-xs text-slate-600 space-y-2.5">
                        <p className="flex justify-between items-center"><strong>วิทยากร:</strong> <span className="font-bold text-[#071A4B]">{targetCourse.speaker}</span></p>
                        <p className="flex justify-between items-center"><strong>สถานที่เข้าเรียน:</strong> <span className="font-bold text-[#071A4B]">{targetCourse.location}</span></p>
                        <p className="flex justify-between items-center"><strong>กำหนดการ:</strong> <span className="font-bold text-[#071A4B] tabular-nums">{targetCourse.date} • {targetCourse.time} น.</span></p>
                        <p className="flex justify-between items-center">
                          <strong>สถานะการเปิดเช็คอิน:</strong> 
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${targetCourse.qrOpened ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {targetCourse.qrOpened ? "เปิดใช้งานเช็คอิน" : "ปิดรับเช็คอินชั่วคราว"}
                          </span>
                        </p>
                      </div>

                      {/* VIEWFINDER SIMULATOR AND CAMERA OVERLAY */}
                      <div className="border border-white/10 border-b-2 border-b-[#F97316] rounded-2xl p-6 bg-[#071A4B] flex flex-col items-center justify-center relative overflow-hidden group min-h-[250px]">
                        
                        {/* Interactive animated laser scanning bar */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-[#F97316] shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-scan-laser"></div>
                        <div className="w-14 h-14 rounded-full bg-[#0D2566] border border-white/15 text-[#F97316] flex items-center justify-center mb-3">
                          <Camera className="h-7 w-7" />
                        </div>
                        <span className="text-xs text-slate-200 font-semibold mb-6">พร้อมประมวลผล QR เช็คอินเข้าอบรม</span>
                        <button
                          onClick={() => {
                            setCheckInCourse(targetCourse);
                            setShowCheckInModal(true);
                            performDirectCheckIn(targetCourse);
                          }}
                          className="pl-5 pr-2 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs rounded-full shadow-md transition cursor-pointer min-h-[44px] inline-flex items-center gap-2.5"
                        >
                          <span>สแกนเช็คอินอัตโนมัติ (Simulate QR Scan)</span>
                          <span className="w-7 h-7 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-12 border border-dashed border-[#E2E8F0] rounded-2xl bg-[#F5F7FA] text-slate-500 text-xs font-semibold">
                  กรุณาเลือกหลักสูตรที่ลงทะเบียนไว้เพื่อสแกนเช็คอิน
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-[#E2E8F0] hover:border-[#071A4B] rounded-full text-[#071A4B] font-bold text-xs shadow-xs transition duration-150 cursor-pointer"
          >
            ← ย้อนกลับไปประวัติการอบรม
          </button>
          
          <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-[#F97316] text-white flex items-center justify-center shrink-0">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#EA580C]">COURSE EVALUATION</span>
                </div>
                <h2 className="text-xl font-extrabold text-[#071A4B] mt-0.5">
                  ประเมินความพึงพอใจการอบรม <span className="text-[#F97316]">(Evaluation)</span>
                </h2>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <label className="text-[11px] font-bold text-[#071A4B] uppercase tracking-wider block font-sans">
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
                className="w-full bg-white border border-[#E2E8F0] p-3.5 rounded-xl text-[#071A4B] font-bold text-sm focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] focus:outline-none cursor-pointer"
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
                    <div className="bg-[#F5F7FA] rounded-2xl p-4 border border-[#E2E8F0] text-xs text-slate-600 space-y-2.5">
                      <p className="flex justify-between items-center gap-4"><strong>หลักสูตร:</strong> <span className="font-extrabold text-[#071A4B] text-right">{targetEval.title}</span></p>
                      <p className="flex justify-between items-center gap-4"><strong>วิทยากรหลัก:</strong> <span className="font-bold text-[#071A4B]">{targetEval.speaker}</span></p>
                      <p className="flex justify-between items-center gap-4"><strong>วันและเวลาสัมมนา:</strong> <span className="font-bold text-[#071A4B] tabular-nums">{targetEval.date} • {targetEval.time} น.</span></p>
                    </div>

                    {false ? (
                      /* QUICK SURVEY FOR EXTERNAL LINK */
                      <div className="space-y-6">
                        <div className="bg-slate-50 border border-[#E2E8F0] rounded-2xl p-4 text-xs text-[#071A4B] space-y-2 font-sans" id="custom-survey-url-notice">
                          <strong className="block font-bold text-sm text-[#071A4B]">📋 หลักสูตรนี้ใช้แบบประเมินภายนอก (Google Forms / Apps Script):</strong>
                          <p className="leading-relaxed font-medium text-slate-600">
                            เพื่อเก็บสถิติภาพรวมเข้าระบบประเมินของสถาบันและทำการอนุมัติวุฒิบัตรสะสมเครดิตให้กับท่านโดยอัตโนมัติ กรุณาดำเนินการดังนี้:
                          </p>
                          <ol className="list-decimal list-inside space-y-1.5 ml-1 font-semibold text-[#071A4B]">
                            <li>ให้คะแนนความพึงพอใจและระดับการแนะนำเบื้องต้นด้านล่าง</li>
                            <li>คลิกปุ่มด้านล่างเพื่อเปิดทำแบบประเมินฉบับเต็มภายนอก</li>
                            <li>กลับมากดปุ่มบันทึกด้านล่างสุดเพื่อบันทึกและเปิดรับเกียรติบัตร</li>
                          </ol>
                          <div className="pt-2 flex flex-wrap items-center gap-2">
                            <a
                              href={targetEval.customSurveyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setHasOpenedCustomSurvey(true)}
                              className="inline-flex items-center gap-2 bg-[#071A4B] hover:bg-[#0D2566] text-white font-bold px-5 py-2.5 rounded-full shadow-sm transition duration-150 text-xs cursor-pointer min-h-[44px]"
                              id="btn-open-external-survey"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>คลิกเปิดลิงก์เพื่อทำแบบประเมินฉบับเต็มภายนอก</span>
                            </a>
                            {hasOpenedCustomSurvey && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                                <Check className="h-4 w-4 text-emerald-600" />
                                เปิดลิงก์แล้ว
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Satisfaction ratings */}
                        <div className="space-y-3">
                          <label className="block text-xs font-bold text-[#071A4B] uppercase tracking-wider font-sans">
                            1. คุณรู้สึกพึงพอใจและได้ประโยชน์ภาพลักษณ์ความรู้จากโครงการในระดับใด? (Satisfaction Star)
                          </label>
                          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-[#E2E8F0]">
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
                                        ? 'fill-[#F97316] text-[#F97316]' 
                                        : 'text-slate-200'
                                    }`} 
                                  />
                                </button>
                              ))}
                            </div>
                            <span className="text-xs font-black text-[#071A4B] bg-orange-50 px-3 py-1 rounded-full border border-orange-200">
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
                          <label className="block text-xs font-bold text-[#071A4B] uppercase tracking-wider font-sans">
                            2. ความเต็มใจที่คุณประสงค์จะแนะนำโครงการอบรมสัมมนานี้ให้แก่บุคลากรคณาจารย์ท่านอื่น? (Recommendation Star)
                          </label>
                          <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-[#E2E8F0]">
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
                                        ? 'fill-[#071A4B] text-[#071A4B]' 
                                        : 'text-slate-200'
                                    }`} 
                                  />
                                </button>
                              ))}
                            </div>
                            <span className="text-xs font-black text-[#071A4B] bg-[#F5F7FA] px-3 py-1 rounded-full border border-[#E2E8F0]">
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
                          <label className="block text-xs font-bold text-[#071A4B]">
                            3. ความคิดเห็น/ข้อเสนอแนะเพิ่มเติม เพื่อพัฒนาปรับปรุงระบบหรือหัวข้อของวิทยากรในวิจัยครั้งถัดไป
                          </label>
                          <textarea
                            placeholder="ขอบคุณผู้จัดโครงการ วิทยากรปาร์จารย์ หรือฝากข้อความแนะนำเรื่องที่สนใจในโอกาสหน้า..."
                            value={surveyComments}
                            onChange={(e) => setSurveyComments(e.target.value)}
                            rows={3}
                            className="w-full text-[#071A4B] bg-white border border-[#E2E8F0] p-3 rounded-2xl text-xs focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] focus:outline-none transition"
                            id="input-survey-comments"
                          />
                        </div>
                      </div>
                    ) : (
                      /* FULL DYNAMIC QUESTIONNAIRE */
                      <div className="space-y-6">
                        {/* Part 1: Affiliations */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-[#071A4B] uppercase tracking-wider font-sans">
                            ส่วนที่ 1: สังกัดหน่วยงานผู้รับการอบรม *
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-4 rounded-2xl border border-[#E2E8F0]">
                            {activeEvalConfig.part1Affiliations.map((opt) => (
                              <label key={opt} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition text-xs font-semibold text-slate-700">
                                <input
                                  type="radio"
                                  name="affiliation"
                                  value={opt}
                                  checked={affiliation === opt}
                                  onChange={(e) => setAffiliation(e.target.value)}
                                  className="h-4 w-4 text-[#F97316] focus:ring-[#F97316] border-slate-300"
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
                              className="w-full text-[#071A4B] bg-white border border-[#E2E8F0] p-3 rounded-2xl text-xs focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] focus:outline-none transition animate-fadeIn"
                            />
                          )}
                        </div>

                        {/* Part 2: Knowledge assessment before & after */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-[#071A4B] uppercase tracking-wider font-sans">
                            ส่วนที่ 2: การประเมินตนเอง (ก่อน-หลังการอบรมสัมมนา) *
                          </label>
                          <div className="space-y-4 bg-white p-4 rounded-2xl border border-[#E2E8F0]">
                            {/* Before */}
                            <div className="space-y-2 pb-3 border-b border-slate-100">
                              <span className="text-xs font-semibold text-[#071A4B] block leading-relaxed">
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
                                            ? 'fill-[#F97316] text-[#F97316]' 
                                            : 'text-slate-200'
                                        }`} 
                                      />
                                    </button>
                                  ))}
                                </div>
                                <span className="text-[11px] font-bold text-[#EA580C] bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200 tabular-nums">
                                  ระดับ {part2Before ? `${part2Before} / 5` : 'ยังไม่ได้ประเมิน'}
                                </span>
                              </div>
                            </div>

                            {/* After */}
                            <div className="space-y-2">
                              <span className="text-xs font-semibold text-[#071A4B] block leading-relaxed">
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
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 tabular-nums">
                                  ระดับ {part2After ? `${part2After} / 5` : 'ยังไม่ได้ประเมิน'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Part 3: Questions list */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-[#071A4B] uppercase tracking-wider font-sans">
                            ส่วนที่ 3: ความพึงพอใจต่อรายละเอียดและภาพรวมของโครงการ
                          </label>
                          <div className="space-y-4 bg-white p-4 rounded-2xl border border-[#E2E8F0]">
                            {activeEvalConfig.part3Questions.map((q, idx) => {
                              const value = answers[q.id];

                              return (
                                <div key={q.id} className="space-y-2.5 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                                  <label className="block text-xs font-semibold text-[#071A4B] leading-relaxed">
                                    {idx + 1}. {q.text} {q.required && <span className="text-rose-500 font-bold">*</span>}
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
                                                  ? 'fill-[#F97316] text-[#F97316]' 
                                                  : 'text-slate-200'
                                              }`} 
                                            />
                                          </button>
                                        ))}
                                      </div>
                                      <span className="text-[11px] font-bold text-[#071A4B] bg-[#F5F7FA] px-2.5 py-0.5 rounded-full border border-[#E2E8F0] tabular-nums">
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
                                      className="w-full text-[#071A4B] bg-white border border-[#E2E8F0] p-2.5 rounded-lg text-xs focus:ring-1 focus:ring-[#F97316] focus:outline-none transition"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Part 4: Recommendation level */}
                        <div className="space-y-3">
                          <label className="block text-xs font-extrabold text-[#071A4B] uppercase tracking-wider font-sans">
                            ส่วนที่ 4: การแนะนำโครงการ *
                          </label>
                          <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] space-y-3">
                            <span className="text-xs font-semibold text-[#071A4B] block leading-relaxed">
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
                                          ? 'fill-[#071A4B] text-[#071A4B]' 
                                          : 'text-slate-200'
                                      }`} 
                                    />
                                  </button>
                                ))}
                              </div>
                              <span className="text-xs font-black text-[#071A4B] bg-[#F5F7FA] px-3 py-1 rounded-full border border-[#E2E8F0]">
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
                      className="w-full bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-white font-bold py-2.5 pl-6 pr-2.5 rounded-full text-xs shadow-sm transition duration-150 flex items-center justify-between min-h-[46px] cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        <span>{submitting ? "กำลังส่งบันทึกความคิดเห็น..." : "บันทึกและส่งผลประเมินความพึงพอใจโครงการ"}</span>
                      </span>
                      <span className="w-8 h-8 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0">
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-12 border border-dashed border-[#E2E8F0] rounded-2xl bg-[#F5F7FA] text-slate-500 text-xs font-semibold">
                {courses.filter(c => validRegistrations.some(r => r.courseId === c.id && !r.feedback)).length > 0 
                  ? "กรุณาเลือกหลักสูตรที่เข้าร่วมแล้วและยังค้างทำประเมินในรายการด้านบน"
                  : "คุณได้กรอกแบบประเมินครบถ้วนทั้งหมดแล้วสำหรับโครงการที่เข้าอบรม"
                }
              </div>
            )}
          </div>
          

          {/* List of Checked-In History with Certificates */}
          <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-extrabold text-[#071A4B] flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0">
                <Award className="h-4 w-4 text-[#F97316]" />
              </span>
              <span>ประวัติการเข้าอบรมและวุฒิบัตรของฉัน <span className="text-[#F97316]">(My Certificates)</span></span>
            </h3>

            {validRegistrations.filter(r => r.checkedIn).length === 0 ? (
              <p className="text-slate-500 text-xs py-8 text-center border border-dashed border-[#E2E8F0] rounded-2xl bg-[#F5F7FA]">
                ยังไม่มีข้อมูลหลักสูตรที่เข้าอบรมสำเร็จในระบบ เมื่อท่านสแกนเช็คอินเข้าเรียนเรียบร้อยแล้ว วุฒิบัตรจะแสดงที่นี่โดยอัตโนมัติ
              </p>
            ) : (
              <div className="space-y-3">
                {validRegistrations
                  .filter(r => r.checkedIn)
                  .map(reg => {
                    const course = courses.find(c => c.id === reg.courseId);
                    if (!course) return null;
                    
                    return (
                      <div key={reg.id} className="bg-[#F5F7FA] border border-[#E2E8F0] rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-[#071A4B]/30 transition">
                        <div>
                          <h4 className="font-bold text-[#071A4B] text-sm leading-snug">{course.title}</h4>
                          <p className="text-xs text-slate-600 mt-1">วิทยากรหลัก: {course.speaker}</p>
                          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">วันที่อบรม: {course.date} • เช็คอินเข้างานสำเร็จ</p>
                        </div>

                        <button
                          onClick={() => setShowCertCourse(course)}
                          className="w-full sm:w-auto pl-4 pr-2 py-2 bg-[#071A4B] hover:bg-[#0D2566] text-white font-bold text-xs rounded-full flex items-center justify-between gap-3 transition min-h-[42px] cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Award className="h-4 w-4 text-[#F97316]" />
                            <span>ดูวุฒิบัตร (View Cert)</span>
                          </span>
                          <span className="w-6 h-6 rounded-full bg-[#F97316] text-white flex items-center justify-center">
                            <ArrowRight className="h-3 w-3" />
                          </span>
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
        <div className="fixed inset-0 z-50 bg-[#071A4B]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#E2E8F0] flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 bg-[#071A4B] text-white border-b-2 border-b-[#F97316] flex justify-between items-start">
              <div>
                <span className="text-[11px] font-bold text-white bg-[#0D2566] border border-[#F97316]/50 px-3 py-1 rounded-full uppercase">
                  {checkInSuccess 
                    ? (proceedToSurvey ? 'แบบประเมินความพึงพอใจ' : 'เช็คอินสำเร็จเรียบร้อยแล้ว') 
                    : 'ระบบสแกนยืนยันเช็คอิน'
                  }
                </span>
                <h3 className="text-lg font-extrabold text-white mt-2 leading-snug">
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
                className="text-slate-300 hover:text-white p-2 rounded-full hover:bg-white/10 transition min-h-[44px] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body with Scroll */}
            <div className="p-6 overflow-y-auto flex-1">
              {!checkInSuccess ? (
                /* STEP 1: SCAN CHECKIN / CONFIRM CHECKIN */
                <div className="space-y-5" id="step-confirm-checkin">
                  <div className="bg-[#F5F7FA] rounded-2xl p-4 border border-[#E2E8F0] text-xs text-slate-600 space-y-2">
                    <p className="flex justify-between"><strong>วิทยากรหลัก:</strong> <span className="font-semibold text-[#071A4B]">{checkInCourse.speaker}</span></p>
                    <p className="flex justify-between"><strong>วันอบรม:</strong> <span className="tabular-nums">{checkInCourse.date}</span></p>
                    <p className="flex justify-between"><strong>ช่วงเวลา:</strong> <span className="tabular-nums">{checkInCourse.time} น.</span></p>
                    <p className="flex justify-between"><strong>สถานที่จัดงาน:</strong> <span>{checkInCourse.location}</span></p>
                  </div>

                  {/* Automated Auto Check-In Processing UI */}
                  <div className="border border-[#E2E8F0] rounded-2xl p-6 bg-[#F5F7FA] flex flex-col items-center justify-center space-y-3">
                    {submitting ? (
                      <div className="flex flex-col items-center justify-center py-4 space-y-2">
                        <div className="h-10 w-10 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-bold text-[#EA580C] mt-2">กำลังดำเนินการเช็คอินอัตโนมัติ...</p>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#071A4B] flex items-center justify-center text-white mb-1">
                        <CheckCircle2 className="h-7 w-7 text-[#F97316]" />
                      </div>
                    )}
                    <h4 className="text-xs font-extrabold text-[#071A4B] text-center">ตรวจสอบสิทธิ์สำเร็จ (QR Verified)</h4>
                    <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                      ระบบตรวจพบบัญชี {userEmail} เรียบร้อยแล้ว กำลังบันทึกประวัติการอบรมของคุณโดยอัตโนมัติ
                    </p>
                  </div>

                  {checkInError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-xl text-xs flex gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>ไม่สามารถเช็คอินได้:</strong>
                        <p className="mt-0.5">{checkInError}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleConfirmCheckIn}
                      disabled={submitting}
                      className="flex-1 bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-white font-bold py-2.5 pl-5 pr-2.5 rounded-full text-xs shadow-sm transition duration-150 flex items-center justify-between min-h-[44px] cursor-pointer"
                      id="btn-confirm-checkin-action"
                    >
                      <span>{submitting ? 'กำลังบันทึกเช็คอินอัตโนมัติ...' : 'คลิกเพื่อเช็คอินด้วยตนเอง'}</span>
                      <span className="w-7 h-7 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </div>
                </div>
              ) : !proceedToSurvey ? (
                /* STEP 1.5: DELIGHTFUL SUCCESS CONFIRMATION SCREEN */
                <div className="space-y-6 text-center py-4" id="step-checkin-completed-successfully">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md mb-3">
                      <CheckCircle2 className="h-9 w-9" />
                    </div>
                    <h3 className="text-lg font-extrabold text-[#071A4B] leading-tight">
                      เช็คอินสำเร็จเรียบร้อยแล้ว
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      บันทึกประวัติเข้าร่วมกิจกรรมหลักสูตรอบรมเสร็จสิ้นสมบูรณ์
                    </p>
                  </div>

                  <div className="bg-[#F5F7FA] border border-[#E2E8F0] rounded-2xl p-4 text-left text-xs space-y-2.5">
                    <div className="text-[10px] uppercase font-bold text-[#071A4B] tracking-wider flex items-center gap-1 bg-white border border-[#E2E8F0] py-0.5 px-2.5 rounded-full w-fit">
                      รายละเอียดตั๋วประวัติการเข้างาน
                    </div>
                    <div className="divide-y divide-[#E2E8F0] text-slate-700">
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">หลักสูตร:</span>
                        <span className="font-bold text-[#071A4B] text-right">{checkInCourse.title}</span>
                      </div>
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">ผู้เข้าอบรม:</span>
                        <span className="font-bold text-[#071A4B] text-right">{userName}</span>
                      </div>
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">อีเมลมหาวิทยาลัย:</span>
                        <span className="font-semibold text-[#071A4B]">{userEmail}</span>
                      </div>
                      <div className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 font-medium">สถานะ:</span>
                        <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Verified & Saved (เช็คอินแล้ว)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F5F7FA] border border-[#E2E8F0] rounded-xl p-3 text-left text-[11px] leading-relaxed text-slate-600 flex gap-2.5 items-start">
                    <Mail className="h-4 w-4 text-[#F97316] shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[#071A4B]">ส่งเมลยืนยันสำเร็จ:</strong>
                      <p className="mt-0.5 text-slate-500">ระบบได้ส่งรายละเอียดเข้าสู่อีเมลมหาวิทยาลัย <code className="font-mono bg-white border border-[#E2E8F0] px-1.5 py-0.5 rounded text-[#071A4B]">{userEmail}</code> เรียบร้อยแล้ว</p>
                    </div>
                  </div>

                   <div className="pt-2 space-y-2.5">
                    <button
                      onClick={() => {
                        setProceedToSurvey(true);
                      }}
                      className="w-full bg-[#F97316] hover:bg-[#EA580C] text-white font-bold py-2.5 pl-5 pr-2.5 rounded-full text-xs shadow-sm cursor-pointer flex items-center justify-between transition duration-200 min-h-[44px]"
                    >
                      <span className="flex items-center gap-2">
                        <Star className="h-4 w-4 fill-current text-white" />
                        <span>ทำแบบประเมินความพึงพอใจทันทีเพื่อรับวุฒิบัตร</span>
                      </span>
                      <span className="w-7 h-7 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setShowCheckInModal(false);
                        setCheckInSuccess(false);
                        setProceedToSurvey(false);
                      }}
                      className="w-full bg-white hover:bg-slate-50 border border-[#E2E8F0] text-[#071A4B] font-bold py-3 rounded-full text-xs transition duration-200 cursor-pointer"
                    >
                      <span>ปิดหน้าต่างนี้ (ทำประเมินภายหลัง)</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* STEP 2: FILL SATISFACTION EVALUATION */
                <div className="space-y-6" id="step-submit-evaluation">
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>เช็คอินเข้างานสำเร็จเรียบร้อย กรุณากรอกแบบประเมินความพึงพอใจเพื่อเสร็จสิ้น</span>
                  </div>

                  {/* Satisfaction level */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-[#071A4B] uppercase tracking-wide">
                      1. ความพึงพอใจโดยรวมต่อการเข้ารับฟังรอบนี้ (Satisfaction)
                    </label>
                    <div className="flex justify-between items-center gap-2 bg-[#F5F7FA] p-4 rounded-xl border border-[#E2E8F0]">
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
                                ? 'fill-[#F97316] text-[#F97316]' 
                                : 'text-slate-300'
                            }`} 
                          />
                        </button>
                      ))}
                      <span className="text-xs font-extrabold text-[#071A4B] tabular-nums">
                        {surveySatisfaction !== null ? `${surveySatisfaction * 20}%` : 'ยังไม่ได้เลือกประเมิน'}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation level */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#071A4B]">
                      2. ความต้องการจะแนะนำในโครงการอบรมถัดไป (Recommendation)
                    </label>
                    <div className="flex justify-between items-center gap-2 bg-[#F5F7FA] p-4 rounded-xl border border-[#E2E8F0]">
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
                                ? 'fill-[#071A4B] text-[#071A4B]' 
                                : 'text-slate-300'
                            }`} 
                          />
                        </button>
                      ))}
                      <span className="text-xs font-extrabold text-[#071A4B] tabular-nums">
                        {surveyRecommendation !== null ? `${surveyRecommendation * 20}%` : 'ยังไม่ได้เลือกประเมิน'}
                      </span>
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-[#071A4B]">
                      3. ข้อแนะนำ/ความคิดเห็นเพิ่มเติมเพื่อพัฒนาระบบ
                    </label>
                    <textarea
                      placeholder="เขียนขอบคุณวิทยากร หรือระบุข้อแนะนำเพิ่มเติม..."
                      value={surveyComments}
                      onChange={(e) => setSurveyComments(e.target.value)}
                      rows={3}
                      className="w-full text-[#071A4B] border border-[#E2E8F0] p-3 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition"
                      id="input-survey-comments"
                    />
                  </div>

                  <button
                    onClick={handleSubmitFeedback}
                    disabled={submitting}
                    className="w-full bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-white font-bold py-2.5 pl-5 pr-2.5 rounded-full text-xs shadow-sm transition duration-150 flex items-center justify-between min-h-[44px] cursor-pointer"
                    id="btn-submit-feedback"
                  >
                    <span className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      <span>บันทึกและส่งผลประเมิน (Submit Review)</span>
                    </span>
                    <span className="w-7 h-7 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CERTIFICATE MODAL */}
      {showCertCourse && (
        <div className="fixed inset-0 z-50 bg-[#071A4B]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-[#E2E8F0] border-b-4 border-b-[#F97316] relative overflow-hidden flex flex-col items-center">
            
            {/* Subtle structural border frame */}
            <div className="absolute inset-4 border border-double border-[#071A4B]/20 bg-[#F5F7FA]/40 rounded-2xl pointer-events-none"></div>

            {/* Close Button */}
            <button
              onClick={() => setShowCertCourse(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-[#071A4B] bg-slate-100 rounded-full transition z-10 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Certificate Header Banner */}
            <div className="text-center space-y-2 mt-4 z-10">
              <span className="text-[11px] font-extrabold tracking-widest text-[#EA580C] block uppercase">BANGKOK UNIVERSITY ACHIEVEMENT ACCREDITATION</span>
              <h3 className="font-extrabold text-2xl text-[#071A4B] tracking-tight">ใบประกาศนียบัตรผ่านการฝึกอบรมพัฒนาบุคลากร</h3>
              <p className="text-[11px] text-slate-500 font-medium">สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ (BU-QA)</p>
            </div>

            {/* Seal / Icon */}
            <div className="my-6 z-10 flex flex-col items-center">
              <div className="bg-[#071A4B] p-4 rounded-full flex items-center justify-center shadow-sm">
                <Award className="h-10 w-10 text-[#F97316] stroke-[1.75]" />
              </div>
            </div>

            {/* Recipient Text Body */}
            <div className="text-center space-y-6 max-w-lg z-10">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 block">ใบสำคัญฉบับนี้ขอรับรองและประจักษ์ว่า</span>
                <span className="text-2xl font-extrabold text-[#071A4B] border-b-2 border-[#F97316] pb-1.5 px-6 inline-block tracking-tight">
                  {userName}
                </span>
                <span className="text-xs text-slate-500 block pt-1">สังกัดหน่วยงาน: {department || "บุคลากร"}</span>
              </div>

              <div className="space-y-2 text-sm text-slate-700 leading-relaxed font-semibold">
                <p>ได้ผ่านเกณฑ์เช็คอินเข้าชั้นเรียนและส่งแบบวัดสัมฤทธิ์ผลการเรียนรู้ครบถ้วน</p>
                <div className="bg-white border border-[#E2E8F0] p-4 rounded-2xl shadow-xs">
                  <p className="text-[#EA580C] text-[11px] font-extrabold uppercase tracking-wider">หลักสูตรสัมมนาวิชาชีพ:</p>
                  <p className="text-[#071A4B] font-extrabold text-base mt-1 tracking-tight leading-snug">
                    {showCertCourse.title}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">วิทยากรผู้บรรยาย: <strong className="text-[#071A4B]">{showCertCourse.speaker}</strong></p>
                </div>
              </div>

              <p className="text-xs text-slate-400 pt-2 font-medium">
                จัดขึ้น ณ Bangkok University • ให้ไว้เป็นหลักฐานสะสมชั่วโมงการพัฒนาบุคลากร
              </p>
            </div>

            {/* Footer signatures and seal stamp */}
            <div className="grid grid-cols-2 gap-12 sm:gap-20 border-t border-[#E2E8F0] pt-8 mt-8 w-full text-center text-xs text-slate-500 z-10">
              <div className="space-y-1">
                <div className="h-6 flex items-center justify-center">
                  <span className="font-mono text-xs italic text-slate-400 select-none">BU-DIGITAL-SIGN</span>
                </div>
                <p className="font-bold text-[#071A4B]">สำนักมาตรฐานคุณภาพการศึกษา</p>
                <p className="text-[10px] text-slate-400">Bangkok University</p>
              </div>

              <div className="space-y-1">
                <div className="h-6 flex items-center justify-center">
                  <span className="font-bold text-[#EA580C] text-[10px] border border-orange-200 px-2.5 py-0.5 rounded-full select-none bg-orange-50 uppercase tracking-wider">CERTIFIED</span>
                </div>
                <p className="font-bold text-[#071A4B]">วิทยากรเจ้าของโครงการ</p>
                <p className="text-[10px] text-slate-400">{showCertCourse.speaker}</p>
              </div>
            </div>

            {/* Print trigger button */}
            <button
              onClick={() => {
                window.print();
              }}
              className="mt-8 bg-[#F97316] hover:bg-[#EA580C] text-white font-bold py-2.5 pl-5 pr-2.5 rounded-full text-xs transition duration-150 flex items-center gap-3 z-10 cursor-pointer shadow-sm"
            >
              <span>พิมพ์ใบประกาศนียบัตร (Print or PDF)</span>
              <span className="w-7 h-7 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* REGISTRATION EMAIL CONFIRMATION MODAL */}
      {previewRegId && (
        (() => {
          const reg = validRegistrations.find(r => r.id === previewRegId);
          const course = reg ? courses.find(c => c.id === reg.courseId) : null;
          if (!reg || !course) return null;
          
          return (
            <div className="fixed inset-0 z-50 bg-[#071A4B]/65 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#E2E8F0] relative flex flex-col" id="email-confirmation-modal">
                {/* Header */}
                <div className="p-6 border-b border-white/10 border-b-2 border-b-[#F97316] flex items-center justify-between sticky top-0 bg-[#071A4B] text-white z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#F97316] rounded-full text-white flex items-center justify-center shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-sm">การแจ้งเตือนยืนยันการลงทะเบียนเข้าอบรม (Email Notification)</h3>
                      <p className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider">Automated Notification System</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setPreviewRegId(null);
                      setResendSuccess(false);
                      setResendError(null);
                    }}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer"
                    id="btn-close-email-modal-top"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Alert banner summarizing the result */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3 text-emerald-900" id="email-alert-banner">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold">ดำเนินการสำรองสิทธิ์เข้าอบรมเสร็จสิ้น</p>
                      <p className="font-medium text-emerald-700 mt-1">
                        ระบบได้ยืนยันสิทธิ์และทำการลงทะเบียนเข้าร่วมอบรมหลักสูตรนี้เรียบร้อยแล้ว
                        {gasUrl 
                          ? " พร้อมส่งอีเมลตอบรับอัตโนมัติและส่งคำเชิญลง Google Calendar ไปยังบัญชีของท่าน"
                          : " และได้แสดงรายละเอียดข้อความยืนยันในกล่องด้านล่างนี้"
                        }
                      </p>
                    </div>
                  </div>

                  {/* Gmail Container Replica */}
                  <div className="border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs bg-[#F5F7FA]" id="gmail-container-replica">
                    {/* Header Controls */}
                    <div className="bg-[#071A4B] px-4 py-2.5 text-[10px] text-slate-200 font-mono font-bold flex justify-between border-b-2 border-[#F97316]">
                      <span>INCOMING EMAIL PREVIEW</span>
                      <span className="text-[#F97316]">BU TRAINING SYSTEM</span>
                    </div>

                    {/* Email Meta */}
                    <div className="p-4 bg-white border-b border-[#E2E8F0] space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h4 className="text-xs font-extrabold text-[#071A4B] leading-snug">
                          <span className="font-mono text-slate-400 mr-1.5">[Subject]</span> 
                          ยืนยันการลงทะเบียน: {course.title}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-500 bg-[#F5F7FA] border border-[#E2E8F0] px-2 py-0.5 rounded-full font-bold w-fit sm:self-start tabular-nums">
                          {new Date(reg.registeredAt).toLocaleString('th-TH')}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium space-y-1">
                        <p><strong>จาก:</strong> <span className="text-[#071A4B] font-semibold">BU Training System &lt;noreply-training@bu.ac.th&gt;</span></p>
                        <p><strong>ถึง:</strong> <span className="text-[#071A4B] font-semibold">{userName} &lt;{userEmail}&gt;</span></p>
                      </div>
                    </div>

                    {/* Email Core Body Content */}
                    <div className="p-4 md:p-6 bg-white">
                      <div className="font-sans text-xs text-slate-700 space-y-4 max-w-xl mx-auto border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
                        <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <h2 className="text-sm font-extrabold text-[#071A4B]">ลงทะเบียนเข้าร่วมอบรมสำเร็จเรียบร้อยแล้ว</h2>
                        </div>
                        <p className="font-medium text-slate-600">สวัสดีคุณ <strong className="text-[#071A4B] font-extrabold">{userName}</strong>,</p>
                        <p className="font-medium text-slate-600">ท่านได้ลงทะเบียนเข้าร่วมอบรมหลักสูตรดังกล่าวเรียบร้อยแล้ว รายละเอียดการจัดกิจกรรมมีดังนี้:</p>
                        
                        <div className="border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs bg-[#F5F7FA] my-4">
                          <table className="w-full border-collapse text-xs">
                            <tbody>
                              <tr className="border-b border-[#E2E8F0] bg-white">
                                <td className="p-2.5 font-bold text-[#071A4B] w-1/3">หลักสูตร</td>
                                <td className="p-2.5 font-medium text-[#071A4B]">{course.title}</td>
                              </tr>
                              <tr className="border-b border-[#E2E8F0]">
                                <td className="p-2.5 font-bold text-[#071A4B]">วันที่จัดกิจกรรม</td>
                                <td className="p-2.5 font-medium text-[#071A4B] tabular-nums">{course.date}</td>
                              </tr>
                              <tr className="border-b border-[#E2E8F0] bg-white">
                                <td className="p-2.5 font-bold text-[#071A4B]">เวลาจัดอบรม</td>
                                <td className="p-2.5 font-medium text-[#071A4B] tabular-nums">{course.time} น.</td>
                              </tr>
                              <tr className="border-b border-[#E2E8F0]">
                                <td className="p-2.5 font-bold text-[#071A4B]">สถานที่</td>
                                <td className="p-2.5 font-medium text-[#071A4B]">{course.location}</td>
                              </tr>
                              <tr className="bg-white">
                                <td className="p-2.5 font-bold text-[#071A4B]">วิทยากรผู้บรรยาย</td>
                                <td className="p-2.5 font-medium text-[#071A4B]">{course.speaker}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          ระบบได้ส่งคำเชิญลง Google Calendar สำหรับกิจกรรมสัมมนานี้ไปยังปฏิทินของท่านเรียบร้อยแล้ว กรุณากดยืนยันมีส่วนร่วมในคำเชิญที่ได้รับเพื่อบันทึกลงปฏิทินส่วนตัวของท่านโดยอัตโนมัติ
                        </p>
                        
                        <div className="border-t border-[#E2E8F0] pt-3 mt-4 text-[10px] text-slate-400 font-medium">
                          อีเมลนี้เป็นการตอบรับอัตโนมัติจาก BU Training Management System มหาวิทยาลัยกรุงเทพ
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Manual trigger to resend email */}
                  {gasUrl && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#F5F7FA] border border-[#E2E8F0] rounded-2xl p-4" id="resend-email-bar">
                      <div className="text-left text-xs">
                        <p className="font-bold text-[#071A4B]">ต้องการส่งอีเมลหรือคำเชิญเข้าปฏิทิน Google อีกครั้ง?</p>
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
                        className="w-full sm:w-auto pl-4 pr-2 py-2 bg-[#F97316] hover:bg-[#EA580C] font-bold text-white text-xs rounded-full flex items-center justify-center gap-2 shadow-xs transition duration-150 disabled:opacity-50 min-h-[42px] cursor-pointer shrink-0"
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
                            <span>ส่งเมลแจ้งเตือนซ้ำ</span>
                            <span className="w-6 h-6 rounded-full bg-[#071A4B] text-white flex items-center justify-center">
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {resendError && (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-rose-800 text-xs flex gap-2" id="resend-email-error">
                      <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <span>{resendError}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#E2E8F0] flex justify-end gap-2 bg-[#F5F7FA] sticky bottom-0 rounded-b-3xl">
                  <button
                    onClick={() => {
                      setPreviewRegId(null);
                      setResendSuccess(false);
                      setResendError(null);
                    }}
                    className="px-6 py-2.5 bg-[#071A4B] hover:bg-[#0D2566] text-white rounded-full text-xs font-bold shadow-sm transition cursor-pointer min-h-[42px]"
                    id="btn-close-email-modal-bottom"
                  >
                    ปิดหน้าต่างนี้
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Full Poster Lightbox Modal */}

      {selectedPosterModal && (
        <div 
          className="fixed inset-0 z-50 bg-[#071A4B]/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPosterModal(null)}
          id="modal-poster-lightbox"
        >
          <div 
            className="relative max-w-2xl max-h-[92vh] bg-white rounded-2xl overflow-hidden shadow-2xl border border-[#E2E8F0] flex flex-col w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#E2E8F0] bg-white sticky top-0 z-10">
              <h4 className="text-xs sm:text-sm font-bold text-[#071A4B] truncate pr-4">
                ภาพโปสเตอร์ประชาสัมพันธ์: {selectedPosterModal.title}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedPosterModal(null)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-[#071A4B] transition cursor-pointer"
                id="btn-close-poster-lightbox"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto p-3 bg-[#F5F7FA] flex items-center justify-center max-h-[calc(92vh-60px)]">
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

      {/* Cancel Registration Confirmation Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 bg-[#071A4B]/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !submitting && setCancelTarget(null)}
          id="modal-cancel-registration"
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2E8F0] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#071A4B]">
                  ยืนยันการยกเลิกการลงทะเบียน
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  คุณต้องการยกเลิกการลงทะเบียนหลักสูตร{' '}
                  <strong className="text-[#071A4B]">"{cancelTarget.course.title}"</strong> ใช่หรือไม่?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCancelTarget(null)}
                className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold border border-[#E2E8F0] bg-white hover:bg-slate-50 text-[#071A4B] transition cursor-pointer min-h-[42px]"
                id="btn-dismiss-cancel-modal"
              >
                เก็บสิทธิ์ไว้
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleCancelRegistration(cancelTarget.course, cancelTarget.registration)}
                className="px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white transition cursor-pointer min-h-[42px]"
                id="btn-confirm-cancel-registration"
              >
                {submitting ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกการลงทะเบียน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {portalToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-2xl shadow-xl border p-4 flex items-start gap-3 text-white transition-all duration-200 ${
            portalToast.type === 'success'
              ? 'bg-[#071A4B] border-[#F97316]'
              : portalToast.type === 'warning'
              ? 'bg-amber-700 border-amber-400'
              : 'bg-rose-700 border-rose-400'
          }`}
          role="status"
          id="portal-toast-notification"
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              portalToast.type === 'success'
                ? 'bg-[#F97316] text-white'
                : portalToast.type === 'warning'
                ? 'bg-amber-500 text-white'
                : 'bg-rose-500 text-white'
            }`}
          >
            {portalToast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <p className="text-xs sm:text-sm font-medium leading-relaxed flex-1">
            {portalToast.message}
          </p>
          <button
            type="button"
            onClick={() => setPortalToast(null)}
            className="text-white/70 hover:text-white p-1 rounded-full cursor-pointer shrink-0"
            aria-label="ปิดการแจ้งเตือน"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
