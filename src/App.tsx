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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 flex flex-col justify-between" id="app-container">
      
      {/* Top Banner Accent */}
      <div className="h-2 bg-gradient-to-r from-orange-600 via-slate-800 to-slate-900 w-full" id="top-accent-line"></div>

      {authLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 h-[80vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-orange-600 border-t-transparent mb-4"></div>
          <p className="text-slate-400 text-sm font-semibold">กำลังยืนยันความปลอดภัย...</p>
        </div>
      ) : (
        <main className="flex-grow flex flex-col">
          <AnimatePresence mode="wait">
            {!user ? (
              /* LANDING PAGE (UNAUTHENTICATED) */
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="flex-1 flex flex-col justify-center items-center py-16 px-4 md:px-8 max-w-4xl mx-auto w-full gap-8"
                id="landing-inner"
              >
                {/* Branding Heading */}
                <div className="text-center space-y-4 max-w-2xl" id="landing-brand">
                  <div className="flex justify-center mb-2">
                    <span className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-850 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-widest shadow-sm">
                      <Landmark className="h-4 w-4" />
                      Bangkok University
                    </span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                    BU Training <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-500 font-black">Management</span> System
                  </h1>
                  <p className="text-slate-500 text-sm md:text-base font-medium max-w-xl mx-auto" id="app-tagline">
                    ระบบบริหารจัดการลงทะเบียน เช็คอินเข้างาน และตอบประเมินผลสัมมนาสำหรับบุคลากรและอาจารย์ แพลตฟอร์มแบบ Single-point All-in-One
                  </p>
                </div>

                {/* Authentication errors panel */}
                {authError && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs max-w-md w-full flex gap-3 shadow-sm"
                    id="login-error-banner"
                  >
                    <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">แจ้งเตือนระบบความปลอดภัย:</strong>
                      <p className="mt-1 leading-relaxed text-rose-700">{authError}</p>
                    </div>
                  </motion.div>
                )}

                {/* Unified Login Card */}
                <div className="bg-white border border-slate-150 p-8 rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 max-w-md w-full text-center space-y-6" id="login-container-card">
                  <div className="space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 text-orange-600 mb-2">
                      <LogIn className="h-6 w-6" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">ลงชื่อเข้าใช้งานระบบ</h2>
                    <p className="text-xs text-slate-400">
                      ยินดีต้อนรับเข้าสู่อุปกรณ์ระบบอบรม เพื่อเริ่มต้นใช้งานกรุณาเข้าสู่ระบบด้วยสิทธิ์บัญชีของท่าน
                    </p>
                  </div>

                  <button
                    onClick={() => handleLogin()}
                    className="w-full flex items-center justify-center gap-3 bg-slate-950 hover:bg-black text-white font-extrabold h-12 px-6 rounded-2xl transition duration-150 shadow-sm hover:shadow-md hover:scale-[1.01] cursor-pointer"
                    id="btn-google-login"
                  >
                    {/* Inline Google G Logo SVG */}
                    <svg className="h-4.5 w-4.5 fill-current text-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.513 0-6.326-2.813-6.326-6.326s2.813-6.326 6.326-6.326c1.65 0 3.003.58 4.114 1.63L19.262 3.51C17.414 1.773 14.97 1 12.24 1 6.042 1 12.24s5.042 11.24 11.24 11.24c5.845 0 10.742-4.114 10.742-11.24 0-.741-.089-1.294-.241-1.955H12.24z"/>
                    </svg>
                    <span>เข้าสู่ระบบด้วย Google Account</span>
                  </button>

                  <div className="border-t border-slate-100 pt-4 flex flex-col items-center gap-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ข้อจำกัดโดเมนเมลสมาชิก</span>
                    <p className="text-[11px] text-slate-500 font-medium">
                      สมาชิกต้องระบุอีเมลส่วนบุคคล <span className="font-bold text-slate-700 font-mono">@bu.ac.th</span> เท่านั้น
                    </p>
                  </div>
                </div>

                {/* Secure warning text footer */}
                <p className="text-[10px] text-slate-400 text-center uppercase tracking-wide bg-slate-105 px-3.5 py-1.5 rounded-full border border-slate-200 shadow-inner">
                  🔐 Secured access via Google Identity Protocol • For Internal BU Employees Only
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
                    <div className="text-center space-y-2" id="role-selection-header">
                      <div className="flex justify-center mb-1">
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 border border-green-200 text-[10px] font-bold uppercase tracking-wider px-3.5 py-1 rounded-full">
                          <CheckCircle className="h-3 w-3 text-green-605" />
                          ยืนยันตัวตนสำเร็จ (Authenticated)
                        </span>
                      </div>
                      <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                        กรุณาเลือกบทบาทในการเข้าใช้งานระบบ
                      </h1>
                      <p className="text-xs md:text-sm text-slate-500 font-semibold" id="selection-logged-info">
                        ยินดีต้อนรับคุณ <strong className="text-slate-800">{dbName || user.displayName || 'บุคลากร'}</strong> (<span className="font-mono text-slate-600">{user.email}</span>)
                      </p>
                    </div>

                    {/* Selection Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mt-2" id="role-selector-grid">
                      
                      {/* Participant card choice */}
                      <div 
                        onClick={() => setSelectedEntrance('user')}
                        className="bg-white border border-slate-200 hover:border-orange-500 hover:shadow-md rounded-[2rem] p-6 text-left cursor-pointer transition-all duration-200 group flex flex-col justify-between"
                        id="role-choice-user"
                      >
                        <div className="space-y-4">
                          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 group-hover:scale-105 transition">
                            <User className="h-6 w-6" />
                          </div>
                          <div className="space-y-1.5">
                            <h2 className="text-lg font-extrabold text-slate-950 group-hover:text-orange-600 transition">
                              ผู้เข้าร่วมอบรม (Participant)
                            </h2>
                            <p className="text-slate-500 text-xs leading-relaxed font-semibold">
                              สำหรับคณาจารย์และเจ้าหน้าที่กองงาน เข้าลงทะเบียนจองสิทธิ์สัมมนา แสดงบัตรเช็คอินคิวอาร์โค้ด และดาวน์โหลดใบประกาศนียบัตรผ่านระบบ
                            </p>
                          </div>
                        </div>
                        <div className="mt-8 flex items-center justify-between text-xs font-bold text-orange-600">
                          <span>ดำเนินการเข้าใช้งานแบบผู้เข้าอบรม →</span>
                        </div>
                      </div>

                      {/* Admin role choice */}
                      {isAdmin ? (
                        <div 
                          onClick={() => setSelectedEntrance('admin')}
                          className="bg-white border border-slate-200 hover:border-slate-800 hover:shadow-md rounded-[2rem] p-6 text-left cursor-pointer transition-all duration-200 group flex flex-col justify-between"
                          id="role-choice-admin-allowed"
                        >
                          <div className="space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-orange-550 flex items-center justify-center border border-slate-850 group-hover:scale-105 transition">
                              <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <h2 className="text-lg font-extrabold text-slate-950 group-hover:text-orange-600 transition">
                                  ผู้ดูแลระบบ / แอดมิน (Admin)
                                </h2>
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">
                                  สิทธิ์แอดมิน
                                </span>
                              </div>
                              <p className="text-slate-500 text-xs leading-relaxed font-semibold">
                                สำหรับทีมงานสถาบันพัฒนาบุคลากร หรือคณบดี จัดสรรบอร์ดสารสนเทศหลักสูตร คุมระบบเอกสารตอบรับ พิมพ์คิวอาร์ และนำเข้าชาร์ตสถิติสัมมนา
                              </p>
                            </div>
                          </div>
                          <div className="mt-8 flex items-center justify-between text-xs font-bold text-slate-900">
                            <span>เข้าสู่ระบบบริหารการจัดการ (แอดมิน) →</span>
                          </div>
                        </div>
                      ) : (
                        <div 
                          className="bg-slate-50/50 border border-slate-200 rounded-[2rem] p-6 text-left opacity-75 relative flex flex-col justify-between cursor-not-allowed"
                          id="role-choice-admin-disabled"
                        >
                          <div className="space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200">
                              <Lock className="h-6 w-6" />
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <h2 className="text-lg font-bold text-slate-400">
                                  ผู้ดูแลระบบ / แอดมิน (Admin)
                                </h2>
                                <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                                  จำกัดสิทธิ์
                                </span>
                              </div>
                              <p className="text-slate-400 text-xs leading-relaxed font-semibold">
                                ระบบผู้ดูแลระบบคัดกรองเฉพาะบัญชีบุคลากรที่ได้รับการแต่งตั้งในกองผู้คุมระบบ หากระดับชั้นสิทธิ์ของท่านไม่ตรงกรุณาติดต่อทีมงาน
                              </p>
                            </div>
                          </div>
                          
                          <div className="mt-8 text-[11px] font-bold text-slate-405 flex items-center gap-1">
                            <span>🔒 สำหรับผู้ที่มีบัญชีในสิทธิ์แอดมินเท่านั้น</span>
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Simple Log Out Option on Role Selector */}
                    <button
                      onClick={handleLogout}
                      className="mt-4 text-xs text-slate-500 hover:text-rose-600 font-bold flex items-center gap-1.5 bg-white border border-slate-200 px-5 py-2.5 rounded-full shadow-sm hover:border-rose-200 transition duration-150 cursor-pointer"
                      id="btn-logout-from-selector"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>ออกจากระบบ / ลงชื่อเข้าใช้ด้วยบัญชีอื่น (Log Out)</span>
                    </button>
                  </motion.div>
                ) : selectedEntrance === 'admin' && isAdmin ? (
                  <div className="relative">
                    {/* Switch layout button back to user view */}
                    <div className="bg-slate-900 text-slate-205 px-4 py-2 hover:bg-black transition text-xs font-bold flex justify-between items-center z-40 relative">
                      <span>อยู่ในหน้าต่างบริหารจัดการระบบอบรม (แอดมิน)</span>
                      <div className="flex gap-2.5">
                        <button 
                          onClick={() => setSelectedEntrance('user')}
                          className="bg-white/15 hover:bg-white/25 text-white rounded px-3 py-1 flex items-center gap-1 transition text-[11px]"
                        >
                          สลับไปดูบอร์ดมุมมองผู้เข้าร่วมอบรม (Participant View)
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
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
                      <div className="bg-orange-600 text-slate-100 px-4 py-2 text-xs font-bold flex justify-between items-center z-40 relative shadow-sm">
                        <span>สิทธิ์แอดมิน: คุณได้รับสิทธิ์ให้เข้าควบคุมดูแลระบบได้</span>
                        <div className="flex gap-2.5">
                          <button 
                            onClick={() => setSelectedEntrance('admin')}
                            className="bg-white/15 hover:bg-white/25 text-white rounded px-3 py-1 flex items-center gap-1 transition font-bold text-[11px]"
                          >
                            เปลี่ยนเข้าสู่โหมดแอดมินบริหารระบบ (Admin Panel)
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
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
      <footer className="py-6 border-t border-slate-100 bg-white" id="app-footer">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-slate-400 text-xs text-center sm:text-left gap-2 mb-2">
          <p id="copyright-text">
            © 2026 <strong>Bangkok University</strong> • ระบบจัดสรรและพิจารณาประสิทธิภาพกำลังบุคลากร
          </p>
          <div className="flex gap-4" id="footer-links">
            <span className="hover:text-slate-600 transition">ฝ่ายเทคโนโลยีสารสนเทศ</span>
            <span className="hover:text-slate-600 transition">นโยบายส่วนบุคคล</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
