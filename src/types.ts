export interface Admin {
  email: string;
  name: string;
  assignedAt: string; // ISO string
  assignedBy: string;
  role: 'Admin' | 'Super Admin' | 'Coordinator';
  staffId?: string;       // รหัสบุคลากร
  position?: string;      // ตำแหน่ง
  department?: string;    // หน่วยงาน
  phone?: string;         // โทรศัพท์
}

export interface Personnel {
  id: string; // Employee ID
  name: string;
  position: string; // Position
  department: string; // Department / หน่วยงาน
  email: string; // Email
  phone: string; // Phone
  createdAt: string; // ISO string
  curriculum?: string; // Curriculum / Study Program / หลักสูตร
  academicDepartment?: string; // Academic Department / ภาควิชา
}

export interface Course {
  id: string;
  title: string;
  speaker: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g., "09:00 - 12:00"
  location: string;
  description?: string;
  posterUrl?: string;
  qrOpened: boolean;
  qrOpenTime?: string | null; // ISO string
  qrCloseTime?: string | null; // ISO string
  registrationCloseTime?: string | null; // ISO string
  registeredCount?: number;
  maxSeats?: number; // Maximum seats / registration limit
  createdAt: string; // ISO string
  createdBy: string;
  targetPositions?: string[];
  targetPersonnelIds?: string[];
  customSurveyUrl?: string;
  visible?: boolean;
  archived?: boolean;
  restrictToTargets?: boolean;
  customEvaluationConfig?: EvaluationConfig;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'rating' | 'text';
  required: boolean;
}

export interface EvaluationConfig {
  part1Affiliations: string[];
  enableOtherAffiliation: boolean;
  part2BeforeLabel: string;
  part2AfterLabel: string;
  part3Questions: SurveyQuestion[];
}

export interface Feedback {
  satisfaction: number; // 1-5
  recommendation?: number; // 1-5
  comments?: string;
  submittedAt?: any; // Firestore Timestamp or ISO string
  affiliation?: string;
  affiliationOther?: string;
  part2Before?: number;
  part2After?: number;
  answers?: Record<string, string | number>;
}

export interface Registration {
  id: string; // CourseId_Email
  courseId: string;
  email: string;
  personnelId: string;
  name: string;
  position?: string;
  department: string;
  curriculum?: string;
  academicDepartment?: string;
  registeredAt: any; // Firestore Timestamp or string
  checkedIn: boolean;
  checkedInAt?: any; // Firestore Timestamp or string
  feedback?: Feedback;
}

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  part1Affiliations: [
    "คณะบัญชี",
    "คณะบริหารธุรกิจ",
    "คณะนิเทศศาสตร์",
    "คณะนิติศาสตร์",
    "คณะมนุษยศาสตร์และการจัดการการท่องเที่ยว",
    "คณะเศรษฐศาสตร์และการลงทุน",
    "คณะเทคโนโลยีสารสนเทศและนวัตกรรม",
    "คณะศิลปกรรมศาสตร์",
    "คณะวิศวกรรมศาสตร์",
    "วิทยาลัยนานาชาติ",
    "คณะสถาปัตยกรรมศาสตร์",
    "คณะการสร้างเจ้าของธุรกิจและการบริหารกิจการ",
    "คณะดิจิทัลมีเดียและศิลปะภาพยนตร์",
    "วิทยาลัยนานาชาติจีน",
    "บัณฑิตวิทยาลัย",
    "สถาบันที่ปรึกษาด้านการจัดการความรู้และนวัตกรรม"
  ],
  enableOtherAffiliation: true,
  part2BeforeLabel: "ก่อนอบรม ท่านมีความเข้าใจเกี่ยวกับ \"หัวข้ออบรม\" อยู่ในระดับใด",
  part2AfterLabel: "หลังอบรม ท่านมีความเข้าใจเกี่ยวกับ \"หัวข้ออบรม\" อยู่ในระดับใด",
  part3Questions: [
    { id: "q1", text: "เนื้อหาการอบรมชัดเจน ตรงความต้องการ", type: "rating", required: true },
    { id: "q2", text: "เนื้อหาการอบรมสามารถนำไปใช้พัฒนาหลักสูตร/ปฏิบัติได้จริง", type: "rating", required: true },
    { id: "q3", text: "การอบรมเปิดโอกาสให้แลกเปลี่ยนเรียนรู้", type: "rating", required: true },
    { id: "q4", text: "รูปแบบและวิธีการอบรม", type: "rating", required: true },
    { id: "q5", text: "ระยะเวลาในการอบรม", type: "rating", required: true },
    { id: "q6", text: "การประสานงาน/การลงทะเบียน", type: "rating", required: true },
    { id: "q7", text: "อาหารว่าง และเครื่องดื่ม", type: "rating", required: true },
    { id: "q8", text: "ความพึงพอใจโดยรวม", type: "rating", required: true },
    { id: "q9", text: "ประเด็นที่ต้องการทราบเพิ่มเติมหรือความรู้สึกที่มีต่อการอบรมครั้งนี้", type: "text", required: false }
  ]
};

export interface CampaignRecipientSnapshot {
  id: string;
  name: string;
  email: string;
  position?: string;
  department?: string;
  reason?: string;
}

export interface CampaignLog {
  id: string;
  courseId: string;
  courseTitle: string;
  subject: string;
  message: string;
  targetType: 'all' | 'custom_dept' | 'position' | 'specific_personnel' | 'bulk_reminder' | 'bulk_evaluation' | 'bulk_certificate' | 'bulk_group';
  targetDetails: string;
  recipientsCount: number;
  successCount: number;
  failCount: number;
  sentAt: string; // ISO string
  sentBy: string; // Admin email
  logs?: string[]; // detailed logs array
  archived?: boolean;
  targetPositions?: string[];
  targetDepts?: string[];
  recipientEmails?: string[];
  recipientIds?: string[];
  recipientsSnapshot?: CampaignRecipientSnapshot[];
  failedRecipients?: CampaignRecipientSnapshot[];
  sendType?: 'individual' | 'group_to' | 'group_bcc';
}

export interface CourseCampaignTemplate {
  courseId: string;
  courseTitle?: string;
  subject: string;
  message: string;
  sendType: 'individual' | 'group_to' | 'group_bcc';
  targetType: 'all' | 'custom_dept' | 'position' | 'specific_personnel';
  targetPositions?: string[];
  targetDepts?: string[];
  targetPersonnelIds?: string[];
  ccAdmin?: boolean;
  ccEmails?: string[];
  savedAt: string; // ISO string
  savedBy?: string;
}
