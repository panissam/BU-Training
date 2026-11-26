import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, signInWithPopup, signOut, 
  User as FirebaseUser, GoogleAuthProvider 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, db, googleProvider, handleFirestoreError, OperationType 
} from './firebase';
import { Admin } from './types';

// Icons
import { 
  ShieldCheck, User, LogOut, ArrowRight, BookOpen, AlertCircle, 
  Clock, Landmark, CheckCircle, LogIn, Lock 
} from 'lucide-react';

// Subcomponents
import ParticipantPortal from './components/ParticipantPortal';
import AdminPortal from './components/AdminPortal';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dbName, setDbName] = useState<string | null>(null);

  // Sync user name with personnel database if exists
  useEffect(() => {
    if (user && user.email) {
      const cleanEmail = user.email.trim().toLowerCase();
      const unsubscribe = onSnapshot(collection(db, 'personnel'), (snap) => {
        let matchedName: string | null = null;
        snap.forEach((doc) => {
          const data = doc.data();
          if (data.email && data.email.trim().toLowerCase() === cleanEmail) {
            if (data.name && data.name.trim()) {
              matchedName = data.name.trim();
            }
          }
        });
        if (matchedName) {
          setDbName(matchedName);
        }
      }, (err) => {
        console.error('Error matching name from db:', err);
      });
      return () => unsubscribe();
    } else {
      setDbName(null);
    }
  }, [user]);
  
  // App-wide email service GAS Web App URL
  const [gasUrl, setGasUrl] = useState<string>(() => {
    return localStorage.getItem('bu_gas_email_url') || '';
  });

  // App-wide base application URL for QR scan and registration links (direct production URL)
  const [baseAppUrl, setBaseAppUrl] = useState<string>(() => {
    return localStorage.getItem('bu_base_app_url') || '';
  });

  // Load from Firestore settings once user logs in
  useEffect(() => {
    if (user) {
      const fetchGlobalConfigs = async () => {
        try {
          const docRef = doc(db, 'settings', 'email_config');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().value) {
            const urlValue = docSnap.data().value;
            setGasUrl(urlValue);
            localStorage.setItem('bu_gas_email_url', urlValue);
          }

          const genDocRef = doc(db, 'settings', 'general_config');
          const genDocSnap = await getDoc(genDocRef);
          if (genDocSnap.exists() && genDocSnap.data().baseAppUrl) {
            const val = genDocSnap.data().baseAppUrl;
            setBaseAppUrl(val);
            localStorage.setItem('bu_base_app_url', val);
          }
        } catch (err) {
          console.error('Failed to retrieve settings from Firestore:', err);
        }
      };
      fetchGlobalConfigs();
    }
  }, [user]);

  const updateGasUrl = async (url: string) => {
    setGasUrl(url);
    localStorage.setItem('bu_gas_email_url', url);
    if (user) {
      try {
        await setDoc(doc(db, 'settings', 'email_config'), {
          id: 'email_config',
          value: url
        });
        console.log('Saved global email GAS URL configuration in Firestore.');
      } catch (err) {
        console.error('Failed to persist email configuration to Firestore:', err);
      }
    }
  };

  const updateBaseAppUrl = async (url: string) => {
    setBaseAppUrl(url);
    localStorage.setItem('bu_base_app_url', url);
    if (user) {
      try {
        await setDoc(doc(db, 'settings', 'general_config'), {
          id: 'general_config',
          baseAppUrl: url
        });
        console.log('Saved global baseAppUrl configuration in Firestore.');
      } catch (err) {
        console.error('Failed to persist baseAppUrl configuration to Firestore:', err);
      }
    }
  };

  // Select role view
  const [selectedEntrance, setSelectedEntrance] = useState<'user' | 'admin' | null>(null);

  // QR Scanning Redirect trigger state
  const [initialCheckInCourseId, setInitialCheckInCourseId] = useState<string | null>(null);
  const [initialFeedbackCourseId, setInitialFeedbackCourseId] = useState<string | null>(null);

  // Read URL query parameters on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get('courseId') || params.get('courseid');
    const action = params.get('action');
    if (courseId && action === 'checkin') {
      setInitialCheckInCourseId(courseId);
      setSelectedEntrance('user'); // Force routing to participant check-in flow
    } else if (courseId && action === 'feedback') {
      setInitialFeedbackCourseId(courseId);
      setSelectedEntrance('user'); // Force routing to participant feedback flow
    }
  }, []);

  // Monitor firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthError(null);
      
      if (currentUser) {
        // Enforce Bangkok University email domain requirement
        const email = (currentUser.email || '').toLowerCase();
        if (!email.endsWith('@bu.ac.th')) {
          setAuthError('ปฏิเสธการเข้าสู่ระบบ: ระบบสารสนเทศนี้จำกัดไว้เฉพาะบุคลากรผู้ใช้งานอีเมลโดเมนมหาวิทยาลัย @bu.ac.th เท่านั้น');
          await signOut(auth);
          setUser(null);
          setIsAdmin(false);
          setAuthLoading(false);
          return;
        }

        setUser(currentUser);

        // Check if Admin
        let hasAccess = false;
        try {
          if (email === 'panisara.l@bu.ac.th') {
            setIsAdmin(true);
            hasAccess = true;
            // Pre-create basic admin profile state in db if not exists
            const admDoc = doc(db, 'admins', email);
            const snap = await getDoc(admDoc);
            if (!snap.exists()) {
              await setDoc(admDoc, {
                email: email,
                name: currentUser.displayName || 'ผู้บริหารโครงการ',
                assignedAt: new Date().toISOString(),
                assignedBy: 'System Bootstrapper',
                role: 'Admin'
              } as Admin);
            }

            // Also ensure official personnel record for Panisara Leesa from QA office
            try {
              const pSnap = await getDocs(collection(db, 'personnel'));
              let foundPersonnel: any = null;
              pSnap.forEach(d => {
                const data = d.data();
                if (data.email && data.email.trim().toLowerCase() === email) {
                  foundPersonnel = { docId: d.id, ...data };
                }
              });

              if (!foundPersonnel) {
                const officialId = 'BUQA-001';
                await setDoc(doc(db, 'personnel', officialId), {
                  id: officialId,
                  name: currentUser.displayName || 'ปณิสรา ลี้สา',
                  department: 'สำนักมาตรฐานคุณภาพการศึกษา',
                  position: 'ผู้บริหารระบบ สำนักมาตรฐานคุณภาพการศึกษา',
                  curriculum: '-',
                  academicDepartment: '-',
                  email: email,
                  phone: '-',
                  createdAt: new Date().toISOString()
                });
                setDbName(currentUser.displayName || 'ปณิสรา ลี้สา');
              } else {
                if (foundPersonnel.name) {
                  setDbName(foundPersonnel.name);
                }
                // If department was placeholder or temporary, upgrade to official QA office
                if (!foundPersonnel.department || foundPersonnel.department === 'ฝ่ายทั่วไป' || foundPersonnel.department === 'ทั่วไป') {
                  await setDoc(doc(db, 'personnel', foundPersonnel.docId), {
                    department: 'สำนักมาตรฐานคุณภาพการศึกษา',
                    position: foundPersonnel.position && foundPersonnel.position !== 'บุคลากรทั่วไป' ? foundPersonnel.position : 'ผู้บริหารระบบ สำนักมาตรฐานคุณภาพการศึกษา'
                  }, { merge: true });
                }
              }
            } catch (pErr) {
              console.error('Error verifying admin personnel profile:', pErr);
            }
          } else {
            const admDoc = doc(db, 'admins', email);
            const snap = await getDoc(admDoc);
            hasAccess = snap.exists();
            setIsAdmin(hasAccess);
          }

          // Direct auto-routing based on role and active QR flow
          const params = new URLSearchParams(window.location.search);
          const courseId = params.get('courseId') || params.get('courseid');
          const action = params.get('action');
          const isCheckInFlow = courseId && action === 'checkin';
          const isFeedbackFlow = courseId && action === 'feedback';

          if (isCheckInFlow || isFeedbackFlow) {
            setSelectedEntrance('user');
          } else {
            setSelectedEntrance(hasAccess ? 'admin' : 'user');
          }
        } catch (err) {
          console.error('Error conducting admin check:', err);
          setIsAdmin(false);
          setSelectedEntrance('user');
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const email = (res.user.email || '').toLowerCase();

      if (!email.endsWith('@bu.ac.th')) {
        setAuthError('ปฏิเสธการเข้าสู่ระบบ: บัญชีอีเมลภายนอกไม่ถูกยอมรับ กรุณาใช้บัญชี @bu.ac.th เท่านั้น');
        await signOut(auth);
        setUser(null);
        setIsAdmin(false);
        return;
      }

      // Check if Admin
      const isSuper = email === 'panisara.l@bu.ac.th';
      const admDoc = doc(db, 'admins', email);
      const snap = await getDoc(admDoc);
      const hasAccess = isSuper || snap.exists();

      setIsAdmin(hasAccess);
      
      // Auto-route based on role and QR flow / feedback flow
      const params = new URLSearchParams(window.location.search);
      const courseId = params.get('courseId') || params.get('courseid');
      const action = params.get('action');
      const isCheckInFlow = (courseId && action === 'checkin') || !!initialCheckInCourseId;
      const isFeedbackFlow = (courseId && action === 'feedback') || !!initialFeedbackCourseId;

      if (isCheckInFlow || isFeedbackFlow) {
        setSelectedEntrance('user');
      } else {
        setSelectedEntrance(hasAccess ? 'admin' : 'user');
      }

    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('การล็อกอินถูกยกเลิกโดยผู้ใช้งาน');
      } else {
        setAuthError('เกิดข้อผิดพลาดในการเชื่อมต่อคลาวด์ โปรดลองใหม่อีกครั้ง');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setIsAdmin(false);
      setSelectedEntrance(null);
      setInitialCheckInCourseId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#071A4B] font-sans selection:bg-orange-100 selection:text-[#071A4B] flex flex-col justify-between" id="app-container">
      
      {/* Top Banner Accent */}
      <div className="h-1.5 bg-gradient-to-r from-[#071A4B] via-[#0A2463] to-[#F97316] w-full" id="top-accent-line"></div>

      {authLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[75vh]">
          <div className="w-12 h-12 rounded-full border-[3px] border-slate-200 border-t-[#F97316] animate-spin mb-4"></div>
          <p className="text-[#071A4B] text-sm font-bold tracking-tight">กำลังตรวจสอบสิทธิ์การเข้าถึง...</p>
          <p className="text-slate-400 text-xs mt-1">Bangkok University Identity Verification</p>
        </div>
      ) : (
        <main className="flex-grow flex flex-col">
          <AnimatePresence mode="wait">
            {!user ? (
              /* LANDING PAGE (UNAUTHENTICATED) */
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex-1 flex flex-col justify-center items-center py-14 px-4 md:px-8 max-w-5xl mx-auto w-full gap-8"
                id="landing-inner"
              >
                {/* Branding Heading */}
                <div className="text-center space-y-3 max-w-2xl" id="landing-brand">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center justify-center gap-2.5">
                    <span className="inline-block w-5 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                    <span>Bangkok University · Staff Development</span>
                  </p>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#071A4B] leading-[1.15]">
                    BU Training <span className="text-[#F97316]">Management</span> System
                  </h1>
                  <p className="text-slate-600 text-sm md:text-base font-medium max-w-xl mx-auto leading-relaxed" id="app-tagline">
                    ระบบบริหารจัดการลงทะเบียน เช็คอินเข้างาน และประเมินผลการอบรมสำหรับคณาจารย์และบุคลากรมหาวิทยาลัยกรุงเทพ
                  </p>
                </div>

                {/* Authentication errors panel */}
                {authError && (
                  <motion.div 
                    initial={{ scale: 0.97, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs max-w-md w-full flex gap-3 shadow-sm"
                    id="login-error-banner"
                  >
                    <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <AlertCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <strong className="block font-bold text-[#071A4B]">แจ้งเตือนระบบความปลอดภัย</strong>
                      <p className="mt-1 leading-relaxed text-rose-700">{authError}</p>
                    </div>
                  </motion.div>
                )}

                {/* Unified Login Card */}
                <div className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] p-8 sm:p-10 rounded-3xl shadow-[0_10px_35px_-10px_rgba(7,26,75,0.1)] max-w-md w-full text-center space-y-6" id="login-container-card">
                  <div className="space-y-3">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#071A4B] text-white shadow-sm mx-auto">
                      <LogIn className="h-6 w-6 text-[#F97316]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 flex items-center justify-center gap-2">
                        <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                        <span>Single Sign-On Portal</span>
                      </p>
                      <h2 className="text-2xl font-extrabold text-[#071A4B] tracking-tight">
                        ลงชื่อเข้าใช้งาน<span className="text-[#F97316]">ระบบ</span>
                      </h2>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      กรุณาเข้าสู่ระบบด้วยบัญชี Google ของมหาวิทยาลัยกรุงเทพเพื่อเริ่มต้นใช้งาน
                    </p>
                  </div>

                  <button
                    onClick={() => handleLogin()}
                    className="w-full group flex items-center justify-between bg-[#F97316] hover:bg-[#EA580C] text-white font-bold h-13 pl-6 pr-2 rounded-full transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#071A4B]"
                    id="btn-google-login"
                  >
                    <span className="flex items-center gap-3 text-sm">
                      <svg className="h-4 w-4 fill-current text-white shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.513 0-6.326-2.813-6.326-6.326s2.813-6.326 6.326-6.326c1.65 0 3.003.58 4.114 1.63L19.262 3.51C17.414 1.773 14.97 1 12.24 1 6.042 1 1 6.042 1 12.24s5.042 11.24 11.24 11.24c5.845 0 10.742-4.114 10.742-11.24 0-.741-.089-1.294-.241-1.955H12.24z"/>
                      </svg>
                      <span className="whitespace-nowrap">เข้าสู่ระบบด้วย Google Account</span>
                    </span>
                    <span className="w-9 h-9 rounded-full bg-[#071A4B] text-white flex items-center justify-center shrink-0 group-hover:translate-x-0.5 transition-transform duration-200">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>

                  <div className="border-t border-slate-100 pt-5 flex flex-col items-center gap-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.15em]">
                      ข้อจำกัดโดเมนเมลสมาชิก
                    </span>
                    <p className="text-xs text-slate-600 font-medium">
                      จำกัดเฉพาะอีเมลบุคลากร <span className="font-bold text-[#071A4B] font-mono">@bu.ac.th</span> เท่านั้น
                    </p>
                  </div>
                </div>

                {/* Secure note */}
                <p className="text-[11px] text-slate-500 text-center tracking-wide flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[#071A4B]" />
                  <span>Secured via Google Identity Protocol · Internal BU Staff Only</span>
                </p>
              </motion.div>
            ) : (
              /* AUTHENTICATED views */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-grow flex flex-col"
                id="portal-auth-container"
              >
                {/* Switch between subportals */}
                {selectedEntrance === null ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col justify-center items-center py-12 px-4 max-w-4xl mx-auto w-full gap-8"
                    id="role-selection-view"
                  >
                    {/* Header Information */}
                    <div className="text-center space-y-2.5" id="role-selection-header">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 flex items-center justify-center gap-2">
                        <span className="inline-block w-5 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                        <span>Authenticated · @bu.ac.th</span>
                      </p>
                      <h1 className="text-2xl md:text-4xl font-extrabold text-[#071A4B] tracking-tight">
                        เลือกบทบาท <span className="text-[#F97316]">เข้าใช้งานระบบ</span>
                      </h1>
                      <p className="text-xs md:text-sm text-slate-500 font-medium" id="selection-logged-info">
                        ยินดีต้อนรับคุณ <strong className="text-[#071A4B]">{dbName || user.displayName || 'บุคลากร'}</strong> · <span className="font-mono text-slate-600">{user.email}</span>
                      </p>
                    </div>

                    {/* Selection Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mt-2" id="role-selector-grid">
                      
                      {/* Participant card choice */}
                      <button
                        type="button"
                        onClick={() => setSelectedEntrance('user')}
                        className="bg-white border border-[#E2E8F0] border-b-2 border-b-[#F97316] hover:border-[#F97316] hover:shadow-[0_10px_30px_-10px_rgba(249,115,22,0.18)] rounded-2xl p-7 text-left cursor-pointer transition-all duration-200 group flex flex-col justify-between"
                        id="role-choice-user"
                      >
                        <div className="space-y-4">
                          <div className="w-12 h-12 rounded-full bg-[#F97316] text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform duration-200">
                            <User className="h-5 w-5" />
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 flex items-center gap-2">
                              <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                              <span>Participant Portal</span>
                            </p>
                            <h2 className="text-lg font-extrabold text-[#071A4B] group-hover:text-[#EA580C] transition-colors">
                              ผู้เข้าร่วมอบรม (Participant)
                            </h2>
                            <p className="text-slate-500 text-xs leading-relaxed">
                              สำหรับคณาจารย์และบุคลากร เข้าลงทะเบียนจองสิทธิ์สัมมนา เช็คอินด้วย QR Code ทำแบบประเมิน และดาวน์โหลดวุฒิบัตร
                            </p>
                          </div>
                        </div>
                        <div className="mt-7 pt-4 border-t border-slate-100 flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-[#071A4B] group-hover:text-[#EA580C] transition-colors">เข้าใช้งานแบบผู้เข้าอบรม</span>
                          <span className="w-8 h-8 rounded-full bg-[#071A4B] group-hover:bg-[#F97316] text-white flex items-center justify-center transition-colors">
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </div>
                      </button>

                      {/* Admin role choice */}
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => setSelectedEntrance('admin')}
                          className="bg-[#071A4B] border border-white/10 border-b-2 border-b-[#F97316] hover:bg-[#0A2463] hover:shadow-[0_10px_30px_-10px_rgba(7,26,75,0.28)] rounded-2xl p-7 text-left cursor-pointer transition-all duration-200 group flex flex-col justify-between text-white"
                          id="role-choice-admin-allowed"
                        >
                          <div className="space-y-4">
                            <div className="w-12 h-12 rounded-full bg-[#0D2566] border border-white/15 text-[#F97316] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform duration-200">
                              <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300 flex items-center gap-2">
                                <span className="inline-block w-4 h-0.5 bg-[#F97316] rounded-full" aria-hidden="true" />
                                <span>Authorized Admin</span>
                              </p>
                              <h2 className="text-lg font-extrabold text-white">
                                ผู้ดูแลระบบ / แอดมิน (<span className="text-[#F97316]">Admin</span>)
                              </h2>
                              <p className="text-slate-300 text-xs leading-relaxed">
                                สำหรับทีมงานพัฒนาบุคลากร จัดการหลักสูตรอบรม ตรวจสอบรายชื่อผู้สมัคร ส่งจดหมายเชิญ และวิเคราะห์ผลประเมิน
                              </p>
                            </div>
                          </div>
                          <div className="mt-7 pt-4 border-t border-white/10 flex items-center justify-between w-full">
                            <span className="text-xs font-bold text-white">เข้าสู่ระบบบริหารจัดการ</span>
                            <span className="w-8 h-8 rounded-full bg-[#F97316] text-white flex items-center justify-center group-hover:bg-[#EA580C] transition-colors">
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          </div>
                        </button>
                      ) : (
                        <div 
                          className="bg-slate-50 border border-[#E2E8F0] rounded-2xl p-7 text-left opacity-75 relative flex flex-col justify-between cursor-not-allowed"
                          id="role-choice-admin-disabled"
                        >
                          <div className="space-y-4">
                            <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center">
                              <Lock className="h-5 w-5" />
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Restricted Access</p>
                              <h2 className="text-lg font-bold text-slate-500">
                                ผู้ดูแลระบบ / แอดมิน (Admin)
                              </h2>
                              <p className="text-slate-400 text-xs leading-relaxed">
                                จำกัดสิทธิ์เฉพาะบุคลากรที่ได้รับการแต่งตั้งเป็นผู้ดูแลระบบเท่านั้น หากต้องการสิทธิ์กรุณาติดต่อทีมงาน
                              </p>
                            </div>
                          </div>
                          
                          <div className="mt-7 pt-4 border-t border-slate-200/70 text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                            <Lock className="h-3.5 w-3.5" />
                            <span>สำหรับผู้ที่มีบัญชีสิทธิ์แอดมินเท่านั้น</span>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Simple Log Out Option on Role Selector */}
                    <button
                      onClick={handleLogout}
                      className="mt-2 text-xs text-[#071A4B] hover:text-rose-600 font-bold flex items-center gap-2 bg-white border border-[#E2E8F0] hover:border-rose-200 px-6 py-2.5 rounded-full shadow-xs transition duration-150 cursor-pointer"
                      id="btn-logout-from-selector"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>ออกจากระบบ / เปลี่ยนบัญชีผู้ใช้งาน</span>
                    </button>
                  </motion.div>
                ) : selectedEntrance === 'admin' && isAdmin ? (
                  <div className="relative">
                    {/* Switch layout button back to user view */}
                    <div className="bg-[#071A4B] text-slate-200 px-4 sm:px-6 py-2.5 border-b border-white/10 text-xs font-semibold flex flex-wrap justify-between items-center gap-2 z-40 relative">
                      <span className="text-slate-300">โหมดผู้ดูแลระบบ (Admin Workspace)</span>
                      <button 
                        onClick={() => setSelectedEntrance('user')}
                        className="bg-[#0D2566] border border-white/10 hover:bg-[#F97316] hover:border-[#F97316] text-white rounded-full px-4 py-1.5 flex items-center gap-2 transition text-[11px] font-bold cursor-pointer whitespace-nowrap"
                      >
                        <span>สลับไปมุมมองผู้เข้าร่วมอบรม</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <AdminPortal 
                      userEmail={user.email || ''} 
                      userName={dbName || user.displayName || 'กรรมการ'} 
                      gasUrl={gasUrl}
                      onUpdateGasUrl={updateGasUrl}
                      baseAppUrl={baseAppUrl}
                      onUpdateBaseAppUrl={updateBaseAppUrl}
                    />
                  </div>
                ) : (
                  <div>
                    {isAdmin && (
                      <div className="bg-[#071A4B] text-white px-4 sm:px-6 py-2.5 border-b border-white/10 text-xs font-semibold flex flex-wrap justify-between items-center gap-2 z-40 relative">
                        <span className="text-slate-300">สิทธิ์ผู้ดูแลระบบ: กำลังแสดงมุมมองผู้เข้าร่วมอบรม</span>
                        <button 
                          onClick={() => setSelectedEntrance('admin')}
                          className="bg-[#F97316] hover:bg-[#EA580C] text-white rounded-full px-4 py-1.5 flex items-center gap-2 transition font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          <span>กลับสู่โหมดแอดมิน (Admin Panel)</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <ParticipantPortal
                      userEmail={user.email || ''}
                      userName={dbName || user.displayName || 'สมชาย'}
                      isAdmin={isAdmin}
                      onLogout={handleLogout}
                      initialCheckInCourseId={initialCheckInCourseId}
                      clearInitialCheckIn={() => setInitialCheckInCourseId(null)}
                      initialFeedbackCourseId={initialFeedbackCourseId}
                      clearInitialFeedback={() => setInitialFeedbackCourseId(null)}
                      gasUrl={gasUrl}
                    />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      )}

      {/* Solid humanized brand footer */}
      <footer className="py-6 border-t border-[#E2E8F0] bg-white" id="app-footer">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-slate-500 text-xs text-center sm:text-left gap-2">
          <p id="copyright-text">
            © 2026 <strong className="text-[#071A4B]">Bangkok University</strong> · สำนักมาตรฐานคุณภาพการศึกษา
          </p>
          <div className="flex gap-4 text-slate-400" id="footer-links">
            <span>BU Training Management System</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
