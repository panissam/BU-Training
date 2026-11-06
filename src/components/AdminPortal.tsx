import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, query, where, getDocs, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, writeBatch, documentId 
} from 'firebase/firestore';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { 
  Plus, PlusCircle, Upload, Download, Trash2, Edit, Check, Settings, Mail, 
  Search, Users, Landmark, Target, Award, ArrowRight, ArrowUpDown, ArrowUp, ArrowDown, ToggleLeft, 
  ToggleRight, Calendar, MapPin, Sparkles, Send, Shield, QrCode, Copy, CheckCircle, Clock, FileSpreadsheet,
  AlertTriangle, Globe, RotateCw, RefreshCw, Filter, Eye, EyeOff, Archive, Info
} from 'lucide-react';
import { db, handleFirestoreError, OperationType, cleanForFirestore } from '../firebase';
import { Course, Personnel, Registration, Admin, SurveyQuestion, EvaluationConfig, DEFAULT_EVALUATION_CONFIG, CampaignLog, CourseCampaignTemplate, CampaignRecipientSnapshot } from '../types';
import { downloadCSV, parsePersonnelCSV, getDisplayCurriculum, decodeCsvBuffer } from '../utils/csv';
import AppsScriptGuide from './AppsScriptGuide';
import { sendGasWebhook, GasWebhookResponse } from '../services/webhookService';

const toLocalDateTimeString = (isoString: string | null | undefined): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export const getPositionCategory = (pPosition: string | null | undefined): string => {
  const pos = (pPosition || '').trim();
  if (!pos) return 'อื่นๆ';
  
  if (pos.includes('รองคณบดี')) {
    return 'รองคณบดี';
  }
  if (pos.includes('คณบดี')) {
    return 'คณบดี';
  }
  if (pos.includes('ผู้อำนวยการหลักสูตร') || pos.includes('ผอ.หลักสูตร')) {
    return 'ผู้อำนวยการหลักสูตร';
  }
  if (pos.includes('หัวหน้าภาค') || pos.includes('หัวหน้าภาควิชา')) {
    return 'หัวหน้าภาค';
  }
  if (pos.includes('หัวหน้าสาขา') || pos.includes('หัวหน้าสาขาวิชา')) {
    return 'หัวหน้าสาขา';
  }
  if (pos.includes('หัวหน้าหลักสูตร')) {
    return 'หัวหน้าหลักสูตร';
  }
  if (pos.includes('ผู้ประสานงาน')) {
    return 'ผู้ประสานงานคณะ';
  }
  if (pos.includes('อาจารย์') || pos === 'อ.') {
    return 'อาจารย์ประจำ';
  }
  return 'อื่นๆ';
};

export const matchPosition = (pPosition: string, targetRole: string): boolean => {
  const pos = (pPosition || '').trim();
  if (!pos) return false;
  
  if (targetRole === 'คณบดี') {
    return pos.includes('คณบดี') && !pos.includes('รองคณบดี');
  }
  if (targetRole === 'รองคณบดี') {
    return pos.includes('รองคณบดี');
  }
  if (targetRole === 'ผู้อำนวยการหลักสูตร') {
    return pos.includes('ผู้อำนวยการหลักสูตร') || pos.includes('ผอ.หลักสูตร');
  }
  if (targetRole === 'หัวหน้าภาค') {
    return pos.includes('หัวหน้าภาค') || pos.includes('หัวหน้าภาควิชา');
  }
  if (targetRole === 'ผู้อำนวยการสำนัก') {
    return pos.includes('ผู้อำนวยการสำนัก') || pos.includes('ผอ.สำนัก') || pos.includes('ผู้อำนวยการสถาบัน') || pos.includes('ผู้อำนวยการศูนย์');
  }
  if (targetRole === 'หัวหน้าหลักสูตร') {
    return pos.includes('หัวหน้าหลักสูตร');
  }
  if (targetRole === 'หัวหน้าสำนัก') {
    return pos.includes('หัวหน้าสำนัก') || pos.includes('หัวหน้างาน') || pos.includes('หัวหน้าสถาบัน') || pos.includes('หัวหน้าศูนย์');
  }
  if (targetRole === 'หัวหน้าสาขา') {
    return pos.includes('หัวหน้าสาขา') || pos.includes('หัวหน้าสาขาวิชา');
  }
  if (targetRole === 'อาจารย์ประจำ') {
    return pos.includes('อาจารย์') || pos === 'อ.';
  }
  if (targetRole === 'ผู้ประสานงานคณะ') {
    return pos.includes('ผู้ประสานงาน');
  }
  
  return pos.includes(targetRole);
};

const ImageToHtmlHelper: React.FC<{ onInsert: (html: string) => void }> = ({ onInsert }) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'hd' | 'standard'>('hd');

  const compressImage = (dataUrl: string, targetMode: 'hd' | 'standard') => {
    setLoading(true);
    const imageObj = new window.Image();
    imageObj.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = targetMode === 'hd' ? 1200 : 600;
      const quality = targetMode === 'hd' ? 0.95 : 0.75;
      
      let width = imageObj.width;
      let height = imageObj.height;

      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imageObj, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        setImagePreview(compressedBase64);
      }
      setLoading(false);
    };
    imageObj.onerror = () => {
      alert('โหลดรูปภาพล้มเหลว');
      setLoading(false);
    };
    imageObj.src = dataUrl;
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ (JPG, PNG) เท่านั้น');
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setOriginalDataUrl(result);
      compressImage(result, mode);
    };
    reader.readAsDataURL(file);
  };

  const handleModeChange = (newMode: 'hd' | 'standard') => {
    setMode(newMode);
    if (originalDataUrl) {
      compressImage(originalDataUrl, newMode);
    }
  };

  const handleInsert = () => {
    if (!imagePreview) return;
    const imgTag = `<img src="${imagePreview}" style="max-width:100%; border-radius:8px; display:block; margin:10px 0;" />`;
    onInsert(imgTag);
    setImagePreview(null);
    setOriginalDataUrl(null);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl mt-2 font-sans">
      <div className="flex justify-between items-center mb-2">
        <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
          🖼️ แทรกไฟล์รูปภาพลงในจดหมาย
        </p>
        <div className="flex bg-slate-200 p-0.5 rounded-lg text-[9px] font-bold">
          <button
            type="button"
            onClick={() => handleModeChange('hd')}
            className={`px-2 py-1 rounded-md transition-all ${
              mode === 'hd'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            ✨ คมชัดสูง (HD)
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('standard')}
            className={`px-2 py-1 rounded-md transition-all ${
              mode === 'standard'
                ? 'bg-slate-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            มาตรฐาน
          </button>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 items-center">
        <label className="cursor-pointer text-[10px] font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition">
          <Upload className="w-3 h-3 text-slate-500" />
          <span>{loading ? 'กำลังประมวลผล...' : 'เลือกไฟล์รูปภาพในเครื่อง'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
            disabled={loading}
          />
        </label>
        
        {imagePreview && (
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 border border-slate-200 rounded overflow-hidden bg-white flex items-center justify-center relative group">
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-[8px] text-white font-bold">{mode === 'hd' ? 'HD' : 'SD'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInsert}
              className="text-[10px] font-extrabold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition shadow-sm flex items-center gap-1"
            >
              📥 แทรกลงในข้อความเลย!
            </button>
            <button
              type="button"
              onClick={() => {
                setImagePreview(null);
                setOriginalDataUrl(null);
              }}
              className="text-[10px] font-medium text-rose-600 hover:bg-rose-50 px-2 py-1.5 rounded-lg transition"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </div>
      
      <div className="text-[9px] text-slate-400 mt-1.5 leading-relaxed">
        {mode === 'hd' ? (
          <p className="text-blue-600 font-semibold">💡 กำลังใช้โหมดคมชัดสูงพิเศษ (HD): ย่อกว้างสูงสุด 1200px คุณภาพ 95% เหมาะสำหรับแผนผัง ที่นั่ง ตาราง และอินโฟกราฟิกที่มีตัวหนังสือเล็กๆ ค่ะ</p>
        ) : (
          <p>💡 โหมดมาตรฐาน: ย่อกว้างสูงสุด 600px คุณภาพ 75% เหมาะสำหรับรูปภาพทั่วไป บรรยากาศ หรือรูปคนทั่วไปค่ะ</p>
        )}
      </div>
    </div>
  );
};

export const PREDEFINED_POSITIONS = [
  'คณบดี',
  'รองคณบดี',
  'ผู้อำนวยการหลักสูตร',
  'ผู้อำนวยการสำนัก',
  'หัวหน้าหลักสูตร',
  'หัวหน้าสำนัก',
  'หัวหน้าภาค',
  'หัวหน้าสาขา',
  'อาจารย์ประจำ',
  'ผู้ประสานงานคณะ'
];

export const DEFAULT_REGISTER_SUBJECT = "ยืนยันการลงทะเบียนอบรม";

export const DEFAULT_REGISTER_HTML = `<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <h2 style='color: #ea580c; margin: 10px 0 0 0; font-weight: 800;'>ยืนยันการลงทะเบียนอบรมสำเร็จ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  
  <p style='font-size: 15px; color: #334155;'>เรียน คุณ <strong>{learner_name}</strong></p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ระบบได้ดำเนินการสำรองที่นั่งสำหรับเข้าการอบรมของท่านเป็นที่เรียบร้อยแล้ว โดยมีรายละเอียดกิจกรรมดังต่อไปนี้</p>
  
  <div style='background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #ea580c; font-size: 14px;'>{course_title}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>วันที่จัดงาน:</strong></td><td>{course_date}</td></tr>
      <tr><td style='padding: 6px 0;'><strong>เวลาจัดอบรม:</strong></td><td>{course_time} น.</td></tr>
      <tr><td style='padding: 6px 0;'><strong>สถานที่อบรม:</strong></td><td>{course_location}</td></tr>
    </table>
  </div>
  
  {course_poster_html}
  
  <p style='font-size: 13px; color: #475569; line-height: 1.6; background-color: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;'>
    <strong>ข้อแนะนำการบันทึกปฏิทิน:</strong> ระบบได้จัดส่งคำเชิญนัดหมายเข้าสู่ Google Calendar (@bu.ac.th) ของคุณเรียบร้อยแล้ว กรุณากดปุ่ม <strong>"ตอบรับ / เข้าร่วม (Yes/Accept)"</strong> ในคำเชิญปฏิทินที่ถูกแนบไปกับกล่องจดหมายเพื่อบันทึกกิจกรรมและตั้งระบบแจ้งเตือนล่วงหน้าโดยอัตโนมัติ
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

export const DEFAULT_CHECKIN_SUBJECT = "เช็คอินเข้าเรียนสำเร็จเรียบร้อย: {course_title}";

export const DEFAULT_CHECKIN_HTML = `<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <h2 style='color: #7c3aed; margin: 10px 0 0 0; font-weight: 800;'>สแกนเช็คอินเข้าชั้นเรียนสำเร็จ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  <p style='font-size: 15px; color: #334155;'>สวัสดีคุณ <strong>{learner_name}</strong>,</p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ระบบได้รับการเช็คอินและสแกนยืนยันการเข้าร่วมงานสัมมนาอบรมของคุณเป็นที่เรียบร้อย ข้อมูลการประเมินเวลามีดังนี้:</p>
  
  <div style='background-color: #f5f3ff; border-left: 4px solid #7c3aed; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #7c3aed; font-size: 14px;'>{course_title}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>วันที่และเวลา:</strong></td><td>{course_date} ({course_time} น.)</td></tr>
      <tr><td style='padding: 6px 0;'><strong>สถานที่จัดงาน:</strong></td><td>{course_location}</td></tr>
    </table>
  </div>
  
  {course_poster_html}
  
  <p style='font-size: 13px; color: #b91c1c; line-height: 1.6; background-color: #fef2f2; padding: 12px; border-radius: 8px; border: 1px solid #fee2e2; font-weight: bold;'>
    ขั้นตอนถัดไป: โปรดล็อกอินเข้าสู่เว็บไซต์ระบบเพื่อตอบแบบประเมินความพึงพอใจโครงการสัมมนานี้ เพื่อรับสิทธิ์จัดพิมพ์วุฒิบัตรสะสมชั่วโมงและเป็นหลักฐานชั่วโมงงานถัดไปค่ะ
  </p>
  
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
  <div style='text-align: center;'>
    <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนแบบอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
    <p style='font-size: 10px; color: #cbd5e1; margin-top: 4px;'>BU Training Management & Personnel Service Solutions</p>
  </div>
</div>`;

export const DEFAULT_REMINDER_SUBJECT = "เตรียมความพร้อมเข้าอบรม: {course_title}";

export const DEFAULT_REMINDER_HTML = `<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <h2 style='color: #2563eb; margin: 10px 0 0 0; font-weight: 800;'>เตรียมความพร้อมเข้าอบรม</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  
  <p style='font-size: 15px; color: #334155;'>เรียน คุณ <strong>{learner_name}</strong></p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ขอแจ้งเตือนการเตรียมความพร้อมก่อนเข้าอบรมสัมมนา ซึ่งจะจัดขึ้นในเร็วๆ นี้ กรุณาตรวจสอบรายละเอียดกิจกรรมด้านล่างนี้</p>
  
  <div style='background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #2563eb; font-size: 14px;'>{course_title}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>วันที่จัดงาน:</strong></td><td>{course_date}</td></tr>
      <tr><td style='padding: 6px 0;'><strong>เวลาจัดอบรม:</strong></td><td>{course_time} น.</td></tr>
      <tr><td style='padding: 6px 0;'><strong>สถานที่อบรม:</strong></td><td>{course_location}</td></tr>
    </table>
  </div>
  
  {course_poster_html}
  
  <p style='font-size: 13px; color: #475569; line-height: 1.6; background-color: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;'>
    <strong>ข้อปฏิบัติเพื่อความเรียบร้อย:</strong> กรุณาเข้าอบรมตรงเวลา และลงทะเบียนเช็คอินสแกนคิวอาร์โค้ด ณ สถานที่จัดงาน เพื่อบันทึกเวลาการเข้าอบรมและนำไปประมวลผลสำหรับจัดทำวุฒิบัตรสะสมชั่วโมงต่อไปค่ะ
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

export const DEFAULT_EVALUATION_SUBJECT = "ขอความอนุเคราะห์ตอบแบบประเมินความพึงพอใจโครงการอบรม: {course_title}";

export const DEFAULT_EVALUATION_HTML = `<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <h2 style='color: #059669; margin: 10px 0 0 0; font-weight: 800;'>ตอบแบบประเมินความพึงพอใจ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  
  <p style='font-size: 15px; color: #334155;'>เรียน คุณ <strong>{learner_name}</strong></p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>สืบเนื่องจากที่ท่านได้เสร็จสิ้นการเข้าร่วมโครงการอบรมสัมมนาของสถาบันเรียบร้อยแล้ว สำนักฯ ใคร่ขอความอนุเคราะห์จากท่านในการร่วมตอบแบบประเมินความพึงพอใจ เพื่อนำข้อมูลไปปรับปรุงการจัดการเรียนรู้และประมวลผลสำหรับงานวิจัยเชิงวิชาการเพื่อพัฒนาสถาบันต่อไปค่ะ</p>
  
  <div style='background-color: #ecfdf5; border-left: 4px solid #059669; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #059669; font-size: 14px;'>{course_title}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>วันที่และเวลา:</strong></td><td>{course_date} ({course_time} น.)</td></tr>
    </table>
  </div>
  
  {course_poster_html}
  
  <div style='text-align: center; margin: 25px 0;'>
    <a href='{survey_link}' style='background-color: #059669; color: #ffffff; padding: 12px 30px; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2);'>คลิกที่นี่เพื่อทำแบบประเมิน</a>
  </div>
  
  <p style='font-size: 13px; color: #475569; line-height: 1.6; background-color: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;'>
    <strong>ประโยชน์การทำประเมิน:</strong> ข้อมูลที่ได้จากการประเมินของท่านจะถูกส่งตรงเข้าสู่รายงานผลสัมมนาวิจัยเพื่อเป็นแนวทางอภิปรายและวิเคราะห์ระดับประสิทธิผลโครงการ ซึ่งหลังจากตอบแบบประเมินเรียบร้อยแล้ว ท่านจะได้รับสิทธิ์จัดพิมพ์วุฒิบัตรสะสมชั่วโมงจากในระบบทันทีค่ะ
  </p>
  
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
  <div style='text-align: center;'>
    <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
    <p style='font-size: 10px; color: #cbd5e1; margin-top: 4px;'>BU Training Management & Personnel Service Solutions</p>
  </div>
</div>`;

interface AdminPortalProps {
  userEmail: string;
  userName: string;
  gasUrl: string;
  onUpdateGasUrl: (url: string) => void;
  baseAppUrl: string;
  onUpdateBaseAppUrl: (url: string) => void;
}

export default function AdminPortal({ 
  userEmail, 
  userName, 
  gasUrl, 
  onUpdateGasUrl,
  baseAppUrl,
  onUpdateBaseAppUrl
}: AdminPortalProps) {
  // Helper to strip any trailing dot in the domain name (e.g. run.app. to run.app)
  const getCleanOrigin = () => {
    if (baseAppUrl && baseAppUrl.trim()) {
      let url = baseAppUrl.trim();
      if (url.endsWith('/')) {
        url = url.slice(0, -1);
      }
      return url;
    }
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

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'personnel' | 'courses' | 'admins' | 'settings' | 'invitations' | 'applicants' | 'evaluations'>('applicants');

  // Custom email template states
  const [registerSubject, setRegisterSubject] = useState('');
  const [registerHtml, setRegisterHtml] = useState('');
  const [checkinSubject, setCheckinSubject] = useState('');
  const [checkinHtml, setCheckinHtml] = useState('');
  const [reminderSubject, setReminderSubject] = useState('');
  const [reminderHtml, setReminderHtml] = useState('');
  const [evaluationSubject, setEvaluationSubject] = useState('');
  const [evaluationHtml, setEvaluationHtml] = useState('');
  const [selectedTemplateTab, setSelectedTemplateTab] = useState<'register' | 'checkin' | 'reminder' | 'evaluation'>('register');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateSuccess, setSaveTemplateSuccess] = useState(false);



  // Dynamic Evaluation Questionnaire states
  const [evaluationConfig, setEvaluationConfig] = useState<EvaluationConfig>(DEFAULT_EVALUATION_CONFIG);
  const [globalEvaluationConfig, setGlobalEvaluationConfig] = useState<EvaluationConfig>(DEFAULT_EVALUATION_CONFIG);
  const [evalTargetCourseId, setEvalTargetCourseId] = useState<string>('global');
  const [savingEvalConfig, setSavingEvalConfig] = useState(false);
  const [saveEvalConfigSuccess, setSaveEvalConfigSuccess] = useState(false);
  const [evaluationSubTab, setEvaluationSubTab] = useState<'report' | 'manage'>('report');
  const [selectedDetailedFeedback, setSelectedDetailedFeedback] = useState<Registration | null>(null);

  // Selected Course ID for "รายชื่อผู้สมัคร" tab
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [showArchivedInDropdown, setShowArchivedInDropdown] = useState<boolean>(false);
  // Selection filter status for applicants: 'all' or 'checkedIn'
  const [applicantStatusFilter, setApplicantStatusFilter] = useState<'all' | 'checkedIn'>('all');
  // Search query for the applicants tab
  const [applicantSearchQuery, setApplicantSearchQuery] = useState('');

  // Bulk Email State in Applicants tab
  const [sendingBulkEmail, setSendingBulkEmail] = useState(false);

  // Modals inside applicants tab
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [showQrCheckinModal, setShowQrCheckinModal] = useState(false);
  const [showManualRegisterModal, setShowManualRegisterModal] = useState(false);
  const [manualRegisterForm, setManualRegisterForm] = useState({ personnelId: '', name: '', email: '', department: '' });
  const [manualRegisterError, setManualRegisterError] = useState('');
  const [manualRegisterSubmitting, setManualRegisterSubmitting] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  // Modal email form values
  const [modalEmailSubject, setModalEmailSubject] = useState('');
  const [modalEmailMessage, setModalEmailMessage] = useState('');

  // Checkbox selection state for applicants
  const [selectedRegIds, setSelectedRegIds] = useState<Record<string, boolean>>({});

  // Firestore resources
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [adminsList, setAdminsList] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);

  const getParticipantDisplayName = (email: string, personnelId: string, fallbackName: string) => {
    const matchedPerson = personnel.find(p => p.email.toLowerCase() === (email || '').toLowerCase() || p.id === personnelId);
    return matchedPerson ? matchedPerson.name : fallbackName;
  };

  // Search, pagination & forms
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelSortOrder, setPersonnelSortOrder] = useState<'asc' | 'desc'>('asc');
  const [personnelPage, setPersonnelPage] = useState(1);
  const itemsPerPage = 20;

  // CSV Encoding setting & corrupted personnel detection
  const [csvEncoding, setCsvEncoding] = useState<'auto' | 'windows-874' | 'utf-8'>('auto');

  // Identify personnel records with corrupted characters / mojibake / \uFFFD from previous mis-encoded imports
  const corruptedPersonnel = personnel.filter(p => {
    const text = `${p.name || ''} ${p.department || ''} ${p.position || ''} ${p.curriculum || ''}`;
    return text.includes('\uFFFD') || /[\u0530-\u058F\u0400-\u04FF\u00C0-\u00FF]/.test(p.name) || p.name.includes('Ե') || p.name.includes('Д');
  });
  const corruptedPersonnelCount = corruptedPersonnel.length;

  // Individual tracker
  const [trackerQuery, setTrackerQuery] = useState('');
  const [trackerResult, setTrackerResult] = useState<{
    person: Personnel | null;
    history: { course: Course; registration: Registration }[];
  } | null>(null);

  // Forms state
  const [courseForm, setCourseForm] = useState<Partial<Course>>({
    title: '', speaker: '', date: '', time: '', location: '', description: '',
    posterUrl: '', qrOpened: false, qrOpenTime: '', qrCloseTime: '',
    registrationCloseTime: '', registeredCount: 0, targetPositions: [], targetPersonnelIds: [],
    customSurveyUrl: '', visible: true, maxSeats: undefined, archived: false, restrictToTargets: false
  });
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [selectedDashboardCourseId, setSelectedDashboardCourseId] = useState<string>('all');
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseFilter, setCourseFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [tempDate, setTempDate] = useState('');

  // Expanded Course Registrations Manager
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [activeCourseSubTab, setActiveCourseSubTab] = useState<'qr' | 'attendees' | 'reminder' | 'evaluation'>('attendees');
  const [courseReminderSubject, setCourseReminderSubject] = useState('');
  const [courseReminderMessage, setCourseReminderMessage] = useState('');
  const [courseEvaluationSubject, setCourseEvaluationSubject] = useState('');
  const [courseEvaluationMessage, setCourseEvaluationMessage] = useState('');
  const [participantSearchTerm, setParticipantSearchTerm] = useState('');
  const [attendeeSubView, setAttendeeSubView] = useState<'registered' | 'invited'>('registered');
  const [retroForm, setRetroForm] = useState({
    personnelId: '',
    name: '',
    email: '',
    department: '',
    checkedIn: true
  });
  const [editingRegistration, setEditingRegistration] = useState<Registration | null>(null);
  const [editRegForm, setEditRegForm] = useState({
    personnelId: '',
    name: '',
    position: '',
    email: '',
    department: '',
    checkedIn: false
  });
  const [editingAdminState, setEditingAdminState] = useState<Admin | null>(null);
  const [editAdminForm, setEditAdminForm] = useState({
    email: '',
    name: '',
    role: 'Admin' as 'Admin' | 'Super Admin' | 'Coordinator',
    staffId: '',
    position: '',
    department: '',
    phone: ''
  });

  const handleAddDate = () => {
    if (!tempDate) return;
    const currentList = courseForm.date ? courseForm.date.split(',').map(d => d.trim()).filter(Boolean) : [];
    if (currentList.includes(tempDate)) {
      alert('วันที่อบรมนี้ถูกเพิ่มไปแล้ว');
      return;
    }
    const updated = [...currentList, tempDate].sort();
    setCourseForm(prev => ({ ...prev, date: updated.join(', ') }));
    setTempDate('');
  };

  const handleRemoveDate = (dateToRemove: string) => {
    const currentList = courseForm.date ? courseForm.date.split(',').map(d => d.trim()).filter(Boolean) : [];
    const updated = currentList.filter(d => d !== dateToRemove);
    setCourseForm(prev => ({ ...prev, date: updated.join(', ') }));
  };

  const [customTargetPosition, setCustomTargetPosition] = useState('');

  const handleToggleTargetPosition = (pos: string) => {
    const current = courseForm.targetPositions || [];
    let updated: string[];
    if (current.includes(pos)) {
      updated = current.filter(p => p !== pos);
    } else {
      updated = [...current, pos];
    }
    setCourseForm(prev => ({ ...prev, targetPositions: updated }));
  };

  const handleAddCustomTargetPosition = () => {
    if (!customTargetPosition.trim()) return;
    const pos = customTargetPosition.trim();
    const current = courseForm.targetPositions || [];
    if (current.includes(pos)) {
      alert('ตำแหน่งนี้รวมอยู่ในกลุ่มเป้าหมายแล้ว');
      return;
    }
    setCourseForm(prev => ({ ...prev, targetPositions: [...current, pos] }));
    setCustomTargetPosition('');
  };

  const [personnelSearchForTarget, setPersonnelSearchForTarget] = useState('');

  const handleAddTargetPersonnel = (id: string) => {
    const current = courseForm.targetPersonnelIds || [];
    if (current.includes(id)) {
      alert('บุคลากรรายนี้รวมอยู่ในผู้มีสิทธิ์เป้าหมายแล้ว');
      return;
    }
    setCourseForm(prev => ({ ...prev, targetPersonnelIds: [...current, id] }));
    setPersonnelSearchForTarget('');
  };

  const handleRemoveTargetPersonnel = (id: string) => {
    const current = courseForm.targetPersonnelIds || [];
    setCourseForm(prev => ({ ...prev, targetPersonnelIds: current.filter(x => x !== id) }));
  };

  const handlePosterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ (JPG, PNG) เทันนั้น');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500; // Optimal for compression & high quality
        const MAX_HEIGHT = 700;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7); // Compress to JPGE 70%
          setCourseForm(prev => ({ ...prev, posterUrl: compressedBase64 }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Admin form
  const [adminForm, setAdminForm] = useState<Partial<Admin>>({
    email: '',
    name: '',
    role: 'Admin',
    staffId: '',
    position: '',
    department: '',
    phone: ''
  });
  
  // Single personnel form
  const [personnelForm, setPersonnelForm] = useState<Partial<Personnel>>({ id: '', name: '', position: '', curriculum: '', academicDepartment: '', department: '', email: '', phone: '' });
  const [showPersonnelForm, setShowPersonnelForm] = useState(false);
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);

  // CSV Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [importReport, setImportReport] = useState<string>('');

  // Bulk Email states
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [selectedCourseForEmail, setSelectedCourseForEmail] = useState<Course | null>(null);
  const [bulkEmailMessage, setBulkEmailMessage] = useState('');

  // Email Campaign States
  const [campaignCourseId, setCampaignCourseId] = useState<string>('');
  const [campaignTargetType, setCampaignTargetType] = useState<'all' | 'specific_personnel' | 'custom_dept' | 'position'>('all');
  const [campaignSpecificPersonnelIds, setCampaignSpecificPersonnelIds] = useState<string[]>([]);
  const [personnelSearchQuery, setPersonnelSearchQuery] = useState('');
  const [campaignSpecificDeptFilter, setCampaignSpecificDeptFilter] = useState<string>('');
  const [campaignSpecificPosFilter, setCampaignSpecificPosFilter] = useState<string>('');
  const [campaignLogs, setCampaignLogs] = useState<CampaignLog[]>([]);
  const [selectedCampaignLogIdForDetails, setSelectedCampaignLogIdForDetails] = useState<string | null>(null);
  const [editingCampaignLog, setEditingCampaignLog] = useState<CampaignLog | null>(null);
  const [editCampaignForm, setEditCampaignForm] = useState<Partial<CampaignLog>>({
    courseId: '', courseTitle: '', subject: '', message: '', targetType: 'all',
    targetDetails: '', recipientsCount: 0, successCount: 0, failCount: 0, sentAt: '', sentBy: '', logs: []
  });
  const [showAddCampaignModal, setShowAddCampaignModal] = useState(false);
  const [addCampaignForm, setAddCampaignForm] = useState<Partial<CampaignLog>>({
    courseId: '', courseTitle: '', subject: '', message: '', targetType: 'all',
    targetDetails: '', recipientsCount: 0, successCount: 0, failCount: 0, sentAt: '', sentBy: '', logs: []
  });
  const [campaignLogFilter, setCampaignLogFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [campaignSearchQuery, setCampaignSearchQuery] = useState<string>('');
  const [campaignDepts, setCampaignDepts] = useState<string[]>([]);
  const [campaignPositions, setCampaignPositions] = useState<string[]>(['อาจารย์ประจำ']);
  const [campaignSendType, setCampaignSendType] = useState<'individual' | 'group_to' | 'group_bcc'>('group_to');
  const [campaignCcAdmin, setCampaignCcAdmin] = useState(false);
  const [campaignCcEmails, setCampaignCcEmails] = useState<string[]>([]);
  const [modalSendType, setModalSendType] = useState<'individual' | 'group_to' | 'group_bcc'>('group_to');
  const [modalCcAdmin, setModalCcAdmin] = useState(false);
  const [modalCcEmails, setModalCcEmails] = useState<string[]>([]);
  const [bulkSendType, setBulkSendType] = useState<'individual' | 'group_to' | 'group_bcc'>('group_to');
  const [bulkCcAdmin, setBulkCcAdmin] = useState(false);
  const [bulkCcEmails, setBulkCcEmails] = useState<string[]>([]);
  const [campaignSubject, setCampaignSubject] = useState<string>('ขอเรียนเชิญบุคลากรเข้าร่วมโครงการอบรม {course_title}');
  const [campaignMessage, setCampaignMessage] = useState<string>(
    'เรียน อาจารย์ {name}\n\nสำนักมาตรฐานคุณภาพการศึกษา ขอเชิญเข้าร่วมอบรม "{course_title}"\nโดยวิทยากร: {speaker}\n\nรายละเอียดกิจกรรมอบรม:\nวันที่จัดงาน: {date_time}\nสถานที่: {location}\n{course_poster}\nสำหรับท่านที่มีความประสงค์จะเข้าร่วมอบรม สามารถลงทะเบียนเพื่อจองสิทธิ์ที่นั่งได้ผ่านทางลิงก์ลงทะเบียนด้านล่าง\n\nขอแสดงความนับถืออย่างสูง\nสำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ'
  );
  const [sendingCampaignMessage, setSendingCampaignMessage] = useState(false);
  const [campaignProgress, setCampaignProgress] = useState<{ total: number; sent: number; logs: string[] } | null>(null);
  const [showCampaignLogs, setShowCampaignLogs] = useState(false);
  const [showCampaignRecipientsModal, setShowCampaignRecipientsModal] = useState(false);
  const [campaignRecipientsSearch, setCampaignRecipientsSearch] = useState('');
  const [showPreSendModal, setShowPreSendModal] = useState<boolean>(false);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile' | 'narrow'>('desktop');
  const [emailTextFontSize, setEmailTextFontSize] = useState<'13px' | '14px' | '15px'>('14px');
  const [emailTextAlign, setEmailTextAlign] = useState<'left' | 'justify'>('left');
  const [emailLineHeight, setEmailLineHeight] = useState<'1.6' | '1.75' | '2.0'>('1.75');
  const [emailWrapMode, setEmailWrapMode] = useState<'natural' | 'strict' | 'keep_all'>('natural');
  const [modalViewTab, setModalViewTab] = useState<'editor' | 'preview'>('editor');
  const [bulkViewTab, setBulkViewTab] = useState<'editor' | 'preview'>('editor');
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState<number>(0);
  const [previewExpandedHeight, setPreviewExpandedHeight] = useState<boolean>(false);
  const [preSendModalTab, setPreSendModalTab] = useState<'editor' | 'preview'>('preview');
  const mainPreviewScrollRef = useRef<HTMLDivElement>(null);
  const modalPreviewScrollRef = useRef<HTMLDivElement>(null);

  const isReusingTargetGroupRef = useRef(false);
  const [campaignReuseNotification, setCampaignReuseNotification] = useState<{
    title: string;
    message: string;
    count?: number;
  } | null>(null);

  // Course Campaign Template Persistence States
  const [courseCampaignTemplates, setCourseCampaignTemplates] = useState<Record<string, CourseCampaignTemplate>>({});
  const [isSavedTemplateLoaded, setIsSavedTemplateLoaded] = useState<boolean>(false);
  const [savedTemplateInfo, setSavedTemplateInfo] = useState<{ date: string; title: string } | null>(null);
  const [templateSaveSuccessMessage, setTemplateSaveSuccessMessage] = useState<string | null>(null);
  const [isSavingTemplateManual, setIsSavingTemplateManual] = useState<boolean>(false);

  // Editable Campaign Recipients State & Controls
  const [campaignCustomRecipients, setCampaignCustomRecipients] = useState<Personnel[]>([]);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [editingPhone, setEditingPhone] = useState('');
  const [editingPosition, setEditingPosition] = useState('');
  const [editingDepartment, setEditingDepartment] = useState('');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [manualAddName, setManualAddName] = useState('');
  const [manualAddEmail, setManualAddEmail] = useState('');
  const [manualAddId, setManualAddId] = useState('');
  const [manualAddDept, setManualAddDept] = useState('');
  const [manualAddPos, setManualAddPos] = useState('');
  const [editingQuickEmailPersonnel, setEditingQuickEmailPersonnel] = useState<{ id: string; name: string; email: string; department?: string; position?: string } | null>(null);
  const [recipientsFilterEmailStatus, setRecipientsFilterEmailStatus] = useState<'all' | 'valid' | 'missing'>('all');

  const [lastFilters, setLastFilters] = useState({
    targetType: '',
    depts: [] as string[],
    positions: [] as string[]
  });

  // Test Email states
  const [testEmailAddress, setTestEmailAddress] = useState(userEmail);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // QR display
  const [showQrModal, setShowQrModal] = useState(false);
  const [showEvalQrModal, setShowEvalQrModal] = useState(false);
  const [qrCourse, setQrCourse] = useState<Course | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Custom Confirmation Dialog Modal State to bypass sandboxed iframe browser confirm blockage
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'ยืนยัน',
    cancelText: 'ยกเลิก',
    isDestructive: true,
    onConfirm: () => {}
  });

  // Helper functions to manage editable campaign recipients list
  const addCampaignRecipient = (person: Personnel) => {
    if (!campaignCustomRecipients.some(r => r.id === person.id)) {
      setCampaignCustomRecipients(prev => [...prev, person]);
    }
  };

  const removeCampaignRecipient = (personId: string) => {
    setCampaignCustomRecipients(prev => prev.filter(r => r.id !== personId));
  };

  useEffect(() => {
    // If personnel is not loaded yet, do nothing
    if (personnel.length === 0) return;

    if (isReusingTargetGroupRef.current) {
      isReusingTargetGroupRef.current = false;
      return;
    }

    const isTargetTypeChanged = lastFilters.targetType !== campaignTargetType;
    const isDeptsChanged = JSON.stringify(lastFilters.depts) !== JSON.stringify(campaignDepts);
    const isPositionsChanged = JSON.stringify(lastFilters.positions) !== JSON.stringify(campaignPositions);

    // Synchronize campaign recipients if target filters change or it's uninitialized
    if (isTargetTypeChanged || isDeptsChanged || isPositionsChanged || (campaignCustomRecipients.length === 0 && campaignTargetType !== 'specific_personnel')) {
      let list: Personnel[] = [];
      if (campaignTargetType === 'all') {
        list = [...personnel];
      } else if (campaignTargetType === 'custom_dept') {
        list = personnel.filter(p => campaignDepts.includes(p.department));
      } else if (campaignTargetType === 'position') {
        list = personnel.filter(p => campaignPositions.some(pos => matchPosition(p.position || '', pos)));
      } else if (campaignTargetType === 'specific_personnel') {
        list = campaignCustomRecipients;
      }
      setCampaignCustomRecipients(list);
      setLastFilters({
        targetType: campaignTargetType,
        depts: [...campaignDepts],
        positions: [...campaignPositions]
      });
    }
  }, [campaignTargetType, campaignDepts, campaignPositions, personnel]);

  const requestConfirmation = (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    options?: { confirmText?: string; cancelText?: string; isDestructive?: boolean }
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm,
      confirmText: options?.confirmText || 'ยืนยันการลบ',
      cancelText: options?.cancelText || 'ยกเลิก',
      isDestructive: options?.isDestructive !== false
    });
  };

  // Load admins
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admins'), (snap) => {
      const list: Admin[] = [];
      snap.forEach(doc => list.push(doc.data() as Admin));
      setAdminsList(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'admins'));
    return unsub;
  }, []);

  // Load personnel
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'personnel'), (snap) => {
      const list: Personnel[] = [];
      snap.forEach(doc => {
        list.push(doc.data() as Personnel);
      });
      list.sort((a,b) => a.name.localeCompare(b.name));
      setPersonnel(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'personnel'));
    return unsub;
  }, []);

  // Load trainings
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'courses'), (snap) => {
      const list: Course[] = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Course);
      });
      list.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      setCourses(list);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'courses'));
    return unsub;
  }, []);

  // Set default campaign course if list is updated
  useEffect(() => {
    if (courses.length > 0 && !campaignCourseId) {
      setCampaignCourseId(courses[0].id);
    }
  }, [courses, campaignCourseId]);

  // Set default selected course for applicants if list is updated
  useEffect(() => {
    if (courses.length > 0 && !selectedCourseId) {
      const firstActive = courses.find(c => !c.archived);
      if (firstActive) {
        setSelectedCourseId(firstActive.id);
      } else {
        setSelectedCourseId(courses[0].id);
      }
    }
  }, [courses, selectedCourseId]);

  // Load registrations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'registrations'), (snap) => {
      const list: Registration[] = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Registration);
      });
      setRegistrations(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'registrations'));
    return unsub;
  }, []);

  // Load campaign logs
  useEffect(() => {
    // 1. Initial preload from localStorage for instant display
    try {
      const cached = JSON.parse(localStorage.getItem('backup_campaign_logs') || '[]');
      if (Array.isArray(cached) && cached.length > 0) {
        setCampaignLogs(cached);
      }
    } catch (e) {
      console.warn("Could not parse local campaign logs cache", e);
    }

    const unsub = onSnapshot(collection(db, 'campaign_logs'), (snap) => {
      const list: CampaignLog[] = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as CampaignLog);
      });
      list.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      setCampaignLogs(list);
      // Keep local backup synchronized
      try {
        localStorage.setItem('backup_campaign_logs', JSON.stringify(list.slice(0, 100)));
      } catch (e) {}
    }, (err) => {
      console.warn("Firestore campaign_logs onSnapshot warning:", err);
      handleFirestoreError(err, OperationType.GET, 'campaign_logs');
    });
    return unsub;
  }, []);

  // Auto-cleanup registrations that belong to deleted/missing courses
  useEffect(() => {
    if (courses.length > 0 && registrations.length > 0) {
      const courseIds = new Set(courses.map(c => c.id));
      const orphanedRegs = registrations.filter(r => r.courseId && !courseIds.has(r.courseId));
      
      if (orphanedRegs.length > 0) {
        console.log(`[Admin Auto-Cleanup] Found ${orphanedRegs.length} orphaned registrations. Cleaning up...`);
        orphanedRegs.forEach(async (reg) => {
          if (!reg.id) return;
          try {
            await deleteDoc(doc(db, 'registrations', reg.id));
            console.log(`[Admin Auto-Cleanup] Successfully deleted orphaned registration ${reg.id}`);
          } catch (err) {
            console.error(`[Admin Auto-Cleanup] Failed to delete orphaned registration ${reg.id}:`, err);
          }
        });
      }
    }
  }, [courses, registrations]);

  // Load email templates from firebase
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'email_templates'), async (snap) => {
      let subject = DEFAULT_REGISTER_SUBJECT;
      let html = DEFAULT_REGISTER_HTML;
      let cSub = DEFAULT_CHECKIN_SUBJECT;
      let cHtml = DEFAULT_CHECKIN_HTML;
      let rSub = DEFAULT_REMINDER_SUBJECT;
      let rHtml = DEFAULT_REMINDER_HTML;
      let eSub = DEFAULT_EVALUATION_SUBJECT;
      let eHtml = DEFAULT_EVALUATION_HTML;

      if (snap.exists()) {
        const data = snap.data();
        subject = data.registerSubject || DEFAULT_REGISTER_SUBJECT;
        html = data.registerHtml || DEFAULT_REGISTER_HTML;
        cSub = data.checkinSubject || DEFAULT_CHECKIN_SUBJECT;
        cHtml = data.checkinHtml || DEFAULT_CHECKIN_HTML;
        rSub = data.reminderSubject || DEFAULT_REMINDER_SUBJECT;
        rHtml = data.reminderHtml || DEFAULT_REMINDER_HTML;
        eSub = data.evaluationSubject || DEFAULT_EVALUATION_SUBJECT;
        eHtml = data.evaluationHtml || DEFAULT_EVALUATION_HTML;

        // Auto-migrate if database contains old default values (specifically for registering)
        const isOldSubject = subject === "ยืนยันการลงทะเบียนเข้าอบรม: {course_title}" || 
                             subject.startsWith("✨ ยืนยันการลงทะเบียนสัมมนากรณีพิเศษสำเร็จ") ||
                             subject.startsWith("[SUCCESS] ยืนยันการลงทะเบียนสัมมนากรณีพิเศษสำเร็จ");
                             
        const isOldHtml = html.includes("ระบบได้ทำรายการลงทะเบียนสำหรับท่านเรียบร้อยแล้วค่ะ") || 
                           html.includes("หลักสูตรอบรมพัฒนาสถาบันคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ") || 
                           html.includes("ระบบได้ทำรายการสำรองที่นั่งสัมมนาสำหรับคุณเรียบร้อยแล้วค่ะ") ||
                           html.includes("สำรองที่นั่ง/ลงทะเบียนสำเร็จ") ||
                           !html.includes("ยืนยันการลงทะเบียนอบรมสำเร็จ");

        if (isOldSubject || isOldHtml) {
          console.log("[Auto-Migration] Migrating email templates to the latest version requested by the user...");
          try {
            const newSubject = isOldSubject ? DEFAULT_REGISTER_SUBJECT : subject;
            const newHtml = isOldHtml ? DEFAULT_REGISTER_HTML : html;
            
            await setDoc(doc(db, 'settings', 'email_templates'), {
              registerSubject: newSubject,
              registerHtml: newHtml,
              checkinSubject: cSub,
              checkinHtml: cHtml,
              reminderSubject: rSub,
              reminderHtml: rHtml,
              evaluationSubject: eSub,
              evaluationHtml: eHtml,
              updatedAt: new Date().toISOString()
            }, { merge: true });
            
            console.log("[Auto-Migration] Successfully updated email templates in Firestore!");
            setRegisterSubject(newSubject);
            setRegisterHtml(newHtml);
            return;
          } catch (e) {
            console.error("[Auto-Migration] Failed to migrate templates in Firestore:", e);
          }
        }
      }

      setRegisterSubject(subject);
      setRegisterHtml(html);
      setCheckinSubject(cSub);
      setCheckinHtml(cHtml);
      setReminderSubject(rSub);
      setReminderHtml(rHtml);
      setEvaluationSubject(eSub);
      setEvaluationHtml(eHtml);
    });
    return unsub;
  }, []);

  // Handler to save email templates
  const handleSaveEmailTemplates = async () => {
    setSavingTemplate(true);
    setSaveTemplateSuccess(false);
    try {
      await setDoc(doc(db, 'settings', 'email_templates'), {
        registerSubject,
        registerHtml,
        checkinSubject,
        checkinHtml,
        reminderSubject,
        reminderHtml,
        evaluationSubject,
        evaluationHtml,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setSaveTemplateSuccess(true);
      setTimeout(() => setSaveTemplateSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('บันทึกเทมเพลตความล้มเหลว ลิงค์เชื่อมฐานข้อมูลมีปัญหา');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Load course-specific campaign templates from Firestore and localStorage
  useEffect(() => {
    try {
      const local = localStorage.getItem('all_course_campaign_templates');
      if (local) {
        setCourseCampaignTemplates(JSON.parse(local));
      }
    } catch (e) {
      console.warn("Could not load local course templates", e);
    }

    const unsub = onSnapshot(doc(db, 'settings', 'course_campaign_templates'), (snap) => {
      if (snap.exists()) {
        const data = (snap.data() || {}) as Record<string, CourseCampaignTemplate>;
        setCourseCampaignTemplates(data);
        try {
          localStorage.setItem('all_course_campaign_templates', JSON.stringify(data));
        } catch (e) {}
      }
    }, (err) => {
      console.warn("Could not sync course_campaign_templates from Firestore, using local cache", err);
    });
    return unsub;
  }, []);

  // Load saved campaign template for a course
  const loadTemplateForCourse = (courseId: string, forceResetDefault: boolean = false) => {
    const currentCourse = courses.find(c => c.id === courseId);
    if (!currentCourse) return;

    if (forceResetDefault) {
      const defaultSub = 'ขอเรียนเชิญบุคลากรเข้าร่วมโครงการอบรม {course_title}';
      const defaultMsg = 'เรียน อาจารย์ {name}\n\nสำนักมาตรฐานคุณภาพการศึกษา ขอเชิญเข้าร่วมอบรม "{course_title}"\nโดยวิทยากร: {speaker}\n\nรายละเอียดกิจกรรมอบรม:\nวันที่จัดงาน: {date_time}\nสถานที่: {location}\n{course_poster}\nสำหรับท่านที่มีความประสงค์จะเข้าร่วมอบรม สามารถลงทะเบียนเพื่อจองสิทธิ์ที่นั่งได้ผ่านทางลิงก์ลงทะเบียนด้านล่าง\n\nขอแสดงความนับถืออย่างสูง\nสำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ';
      setCampaignSubject(defaultSub);
      setCampaignMessage(defaultMsg);
      setCampaignSendType('group_to');
      setCampaignTargetType('all');
      setIsSavedTemplateLoaded(false);
      setSavedTemplateInfo(null);
      setTemplateSaveSuccessMessage('🔄 รีเซ็ตรูปแบบเป็นค่าเริ่มต้นของระบบแล้วค่ะ');
      setTimeout(() => setTemplateSaveSuccessMessage(null), 3000);
      return;
    }

    // 1. Try Firestore in-memory state
    let tpl: CourseCampaignTemplate | null = courseCampaignTemplates[courseId] || null;

    // 2. Try localStorage
    if (!tpl) {
      try {
        const cached = localStorage.getItem(`course_campaign_template_${courseId}`);
        if (cached) {
          tpl = JSON.parse(cached);
        } else {
          const allCached = localStorage.getItem('all_course_campaign_templates');
          if (allCached) {
            const parsed = JSON.parse(allCached);
            if (parsed && parsed[courseId]) {
              tpl = parsed[courseId];
            }
          }
        }
      } catch (e) {
        console.warn("Could not read template from localStorage", e);
      }
    }

    // 3. Fallback to latest campaignLog for this courseId (historical auto-recovery)
    if (!tpl) {
      const matchingLog = campaignLogs.find(l => l.courseId === courseId);
      if (matchingLog && matchingLog.subject && matchingLog.message) {
        tpl = {
          courseId: matchingLog.courseId,
          courseTitle: matchingLog.courseTitle,
          subject: matchingLog.subject,
          message: matchingLog.message,
          sendType: (matchingLog as any).sendType || 'group_to',
          targetType: matchingLog.targetType || 'all',
          targetPositions: matchingLog.targetPositions,
          targetDepts: matchingLog.targetDepts,
          savedAt: matchingLog.sentAt,
          savedBy: matchingLog.sentBy
        };
      }
    }

    if (tpl) {
      setCampaignSubject(tpl.subject);
      setCampaignMessage(tpl.message);
      if (tpl.sendType) setCampaignSendType(tpl.sendType);
      if (tpl.targetType) setCampaignTargetType(tpl.targetType);
      if (tpl.targetPositions && tpl.targetPositions.length > 0) setCampaignPositions(tpl.targetPositions);
      if (tpl.targetDepts && tpl.targetDepts.length > 0) setCampaignDepts(tpl.targetDepts);
      if (tpl.targetPersonnelIds && tpl.targetPersonnelIds.length > 0) setCampaignSpecificPersonnelIds(tpl.targetPersonnelIds);
      if (tpl.ccAdmin !== undefined) setCampaignCcAdmin(tpl.ccAdmin);
      if (tpl.ccEmails && tpl.ccEmails.length > 0) setCampaignCcEmails(tpl.ccEmails);
      setIsSavedTemplateLoaded(true);
      setSavedTemplateInfo({
        date: tpl.savedAt || new Date().toISOString(),
        title: tpl.courseTitle || currentCourse.title
      });
      setTemplateSaveSuccessMessage(`✨ โหลดรูปแบบที่บันทึกไว้ของการประชุม "${currentCourse.title}" เรียบร้อยแล้วค่ะ`);
      setTimeout(() => setTemplateSaveSuccessMessage(null), 3500);
    } else {
      setIsSavedTemplateLoaded(false);
      setSavedTemplateInfo(null);
    }
  };

  // Save current template for course to Firestore and localStorage
  const saveCourseCampaignTemplate = async (courseIdToSave?: string) => {
    const targetCourseId = courseIdToSave || campaignCourseId;
    const currentCourse = courses.find(c => c.id === targetCourseId);
    if (!targetCourseId) return;

    setIsSavingTemplateManual(true);
    const templateObj: CourseCampaignTemplate = {
      courseId: targetCourseId,
      courseTitle: currentCourse?.title || '',
      subject: campaignSubject,
      message: campaignMessage,
      sendType: campaignSendType,
      targetType: campaignTargetType,
      ...(campaignTargetType === 'position' && campaignPositions.length > 0 ? { targetPositions: [...campaignPositions] } : {}),
      ...(campaignTargetType === 'custom_dept' && campaignDepts.length > 0 ? { targetDepts: [...campaignDepts] } : {}),
      ...(campaignTargetType === 'specific_personnel' && campaignSpecificPersonnelIds.length > 0 ? { targetPersonnelIds: [...campaignSpecificPersonnelIds] } : {}),
      ccAdmin: campaignCcAdmin,
      ccEmails: [...campaignCcEmails],
      savedAt: new Date().toISOString(),
      savedBy: userEmail
    };

    const cleanedTemplate = cleanForFirestore(templateObj);

    // 1. Save in React state
    setCourseCampaignTemplates(prev => ({
      ...prev,
      [targetCourseId]: cleanedTemplate
    }));

    // 2. Save in localStorage
    try {
      localStorage.setItem(`course_campaign_template_${targetCourseId}`, JSON.stringify(cleanedTemplate));
      const existingAll = JSON.parse(localStorage.getItem('all_course_campaign_templates') || '{}');
      existingAll[targetCourseId] = cleanedTemplate;
      localStorage.setItem('all_course_campaign_templates', JSON.stringify(existingAll));
    } catch (e) {
      console.warn("LocalStorage save error", e);
    }

    // 3. Save in Firestore settings
    try {
      await setDoc(doc(db, 'settings', 'course_campaign_templates'), {
        [targetCourseId]: cleanedTemplate
      }, { merge: true });
    } catch (err) {
      console.warn("Firestore error saving course campaign template:", err);
    }

    setIsSavedTemplateLoaded(true);
    setSavedTemplateInfo({ date: templateObj.savedAt, title: currentCourse?.title || '' });
    setIsSavingTemplateManual(false);
    setTemplateSaveSuccessMessage(`💾 บันทึกรูปแบบสำหรับ "${currentCourse?.title || 'การประชุมนี้'}" สำเร็จแล้ว! ครั้งต่อไปที่เลือกจะโหลดให้อัตโนมัติค่ะ`);
    setTimeout(() => setTemplateSaveSuccessMessage(null), 4000);
  };

  const handleSelectCampaignCourse = (newCourseId: string) => {
    setCampaignCourseId(newCourseId);
    loadTemplateForCourse(newCourseId);
  };

  // Synchronize campaign course template when course is set or templates loaded
  useEffect(() => {
    if (campaignCourseId && Object.keys(courseCampaignTemplates).length > 0 && !isSavedTemplateLoaded) {
      if (courseCampaignTemplates[campaignCourseId]) {
        loadTemplateForCourse(campaignCourseId);
      }
    }
  }, [courseCampaignTemplates, campaignCourseId]);

  // Load dynamic survey evaluation config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'evaluation_config'), (snap) => {
      let gConfig = DEFAULT_EVALUATION_CONFIG;
      if (snap.exists()) {
        const data = snap.data() as EvaluationConfig;
        gConfig = {
          part1Affiliations: data.part1Affiliations || DEFAULT_EVALUATION_CONFIG.part1Affiliations,
          enableOtherAffiliation: data.enableOtherAffiliation !== undefined ? data.enableOtherAffiliation : DEFAULT_EVALUATION_CONFIG.enableOtherAffiliation,
          part2BeforeLabel: data.part2BeforeLabel || DEFAULT_EVALUATION_CONFIG.part2BeforeLabel,
          part2AfterLabel: data.part2AfterLabel || DEFAULT_EVALUATION_CONFIG.part2AfterLabel,
          part3Questions: data.part3Questions || DEFAULT_EVALUATION_CONFIG.part3Questions
        };
      }
      setGlobalEvaluationConfig(gConfig);
    });
    return unsub;
  }, []);

  const lastTargetIdRef = React.useRef<string | null>(null);
  const lastGlobalConfigRef = React.useRef<EvaluationConfig | null>(null);

  useEffect(() => {
    const isTargetChanged = lastTargetIdRef.current !== evalTargetCourseId;
    const isGlobalLoaded = !lastGlobalConfigRef.current && globalEvaluationConfig !== DEFAULT_EVALUATION_CONFIG;

    if (isTargetChanged || (evalTargetCourseId === 'global' && isGlobalLoaded)) {
      lastTargetIdRef.current = evalTargetCourseId;
      if (globalEvaluationConfig !== DEFAULT_EVALUATION_CONFIG) {
        lastGlobalConfigRef.current = globalEvaluationConfig;
      }

      if (evalTargetCourseId === 'global') {
        setEvaluationConfig(globalEvaluationConfig);
      } else {
        const course = courses.find(c => c.id === evalTargetCourseId);
        if (course && course.customEvaluationConfig) {
          setEvaluationConfig(course.customEvaluationConfig);
        } else {
          setEvaluationConfig(globalEvaluationConfig);
        }
      }
    }
  }, [evalTargetCourseId, globalEvaluationConfig, courses]);

  // Handler to save evaluation configuration
  const handleSaveEvaluationConfig = async (newConfig: EvaluationConfig) => {
    setSavingEvalConfig(true);
    setSaveEvalConfigSuccess(false);
    try {
      if (evalTargetCourseId === 'global') {
        await setDoc(doc(db, 'settings', 'evaluation_config'), newConfig);
      } else {
        await updateDoc(doc(db, 'courses', evalTargetCourseId), {
          customEvaluationConfig: newConfig
        });
      }
      setSaveEvalConfigSuccess(true);
      setTimeout(() => setSaveEvalConfigSuccess(false), 2500);
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถบันทึกข้อคำถามแบบประเมินได้ มั่นใจว่าสิทธิ์อินเทอร์เน็ตยังใช้งานได้ตามปกติค่ะ');
    } finally {
      setSavingEvalConfig(false);
    }
  };

  // Trigger Individual Tracker Search
  const handleTrackerSearch = () => {
    if (!trackerQuery.trim()) {
      setTrackerResult(null);
      return;
    }
    const q = trackerQuery.toLowerCase();
    
    // Find personnel matches
    const matchedPerson = personnel.find(p => 
      p.id.toLowerCase() === q || 
      p.email.toLowerCase() === q || 
      p.name.toLowerCase().includes(q)
    );

    if (!matchedPerson) {
      setTrackerResult({ person: null, history: [] });
      return;
    }

    // Grab registration footprint
    const personRegs = registrations.filter(r => r.email === matchedPerson.email);
    const history = personRegs.map(r => {
      const course = courses.find(c => c.id === r.courseId) || {
        id: r.courseId,
        title: 'โครงการอบรมทั่วไป (พ้นสถานะ)',
        speaker: 'ไม่ระบุ',
        date: '-',
        time: '-',
        location: '-',
        qrOpened: false,
        createdAt: ''
      } as Course;
      return { course, registration: r };
    });

    setTrackerResult({ person: matchedPerson, history });
  };

  // Create or Update Course
  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.title || !courseForm.speaker || !courseForm.date || !courseForm.time || !courseForm.location) {
      alert('กรุณากรอกข้อมูลภาคบังคับให้ครบถ้วน');
      return;
    }

    const courseId = editingCourseId || 'COURSE-' + Date.now();
    const data: Course = {
      ...(courseForm as Course),
      id: courseId,
      qrOpened: courseForm.qrOpened ?? false,
      visible: courseForm.visible !== false,
      createdAt: courseForm.createdAt || new Date().toISOString(),
      createdBy: courseForm.createdBy || userEmail,
      maxSeats: courseForm.maxSeats ? Number(courseForm.maxSeats) : undefined
    };

    const cleanedCourseData = cleanForFirestore(data);

    try {
      await setDoc(doc(db, 'courses', courseId), cleanedCourseData);
      alert(editingCourseId ? 'อัปเดตหลักสูตรเรียบร้อยแล้ว' : 'สร้างหลักสูตรอบรมใหม่สำเร็จเรียบร้อย');
      setCourseForm({
        title: '', speaker: '', date: '', time: '', location: '', description: '',
        posterUrl: '', qrOpened: false, qrOpenTime: '', qrCloseTime: '',
        registrationCloseTime: '', registeredCount: 0, targetPositions: [], targetPersonnelIds: [],
        customSurveyUrl: '', visible: true, maxSeats: undefined, archived: false, restrictToTargets: false
      });
      setEditingCourseId(null);
      setShowCourseForm(false);
    } catch (err) {
      console.error(err);
      alert('บันทึกกิจกรรมอบรมล้มเหลวตามความปลอดภัยระบบ');
    }
  };

  const handleEditCourse = (course: Course) => {
    setCourseForm(course);
    setEditingCourseId(course.id);
    setShowCourseForm(true);
  };

  const handleDeleteCourse = (id: string) => {
    requestConfirmation(
      'ยืนยันลบหลักสูตรอบรม',
      'คุณแน่ใจหรือไม่ที่จะลบรายวิชาการอบรมนี้? ข้อมูลการลงทะเบียนที่สูญหายหรือข้อมูลผู้สมัครจะไม่สามารถกู้คืนกลับมาได้',
      async () => {
        try {
          await deleteDoc(doc(db, 'courses', id));
          alert('ลบหลักสูตรสำเร็จเเล้ว');
        } catch (err) {
          console.error(err);
          alert('คุณไม่มีสิทธิ์การกระทำนี้ หรือเกิดข้อผิดพลาดในการลบ');
        }
      }
    );
  };

  const handleToggleQr = async (course: Course) => {
    try {
      await updateDoc(doc(db, 'courses', course.id), {
        qrOpened: !course.qrOpened
      });
    } catch (err) {
      console.error(err);
      alert('ข้อผิดพลาด: ปฏิเสธการแก้ระดับความปลอดภัย');
    }
  };

  const handleToggleVisibility = async (course: Course) => {
    try {
      const currentVisibility = course.visible !== false;
      await updateDoc(doc(db, 'courses', course.id), {
        visible: !currentVisibility
      });
    } catch (err) {
      console.error(err);
      alert('ข้อผิดพลาด: ไม่สามารถเปลี่ยนสถานะการแสดงผลได้');
    }
  };

  const handleToggleArchive = async (course: Course) => {
    try {
      const nextArchived = !course.archived;
      await updateDoc(doc(db, 'courses', course.id), {
        archived: nextArchived
      });
    } catch (err) {
      console.error(err);
      alert('ข้อผิดพลาด: ไม่สามารถเปลี่ยนสถานะการจัดเก็บหลักสูตรได้');
    }
  };

  const handleAddRetroAttendee = async (course: Course) => {
    if (!retroForm.email || !retroForm.name || !retroForm.personnelId || !retroForm.department) {
      alert('กรุณากรอกข้อมูลผู้เข้าร่วมอบรมย้อนหลังให้ครบทุกช่อง');
      return;
    }

    if (!retroForm.email.endsWith('@bu.ac.th')) {
      alert('อีเมลต้องลงท้ายด้วยโดเมน @bu.ac.th เท่านั้นเพื่อความถูกต้องของฐานข้อมูล');
      return;
    }

    const regId = `${course.id}_${retroForm.email.toLowerCase().replace(/\./g, '_')}`;
    
    // Check if duplicate
    const isAlreadyReg = registrations.some(r => r.courseId === course.id && r.email.toLowerCase() === retroForm.email.toLowerCase());
    if (isAlreadyReg) {
      alert('บุคลากรท่านนี้ได้ถูกเพิ่มหรือลงทะเบียนในกิจกรรมการอบรมนี้เรียบร้อยแล้ว');
      return;
    }

    const newReg: Registration = {
      id: regId,
      courseId: course.id,
      email: retroForm.email.toLowerCase(),
      personnelId: retroForm.personnelId,
      name: retroForm.name,
      department: retroForm.department,
      registeredAt: new Date().toISOString(),
      checkedIn: retroForm.checkedIn,
      checkedInAt: retroForm.checkedIn ? new Date().toISOString() : null
    };

    try {
      await setDoc(doc(db, 'registrations', regId), newReg);
      // Increment registeredCount
      const newCount = (course.registeredCount || 0) + 1;
      await updateDoc(doc(db, 'courses', course.id), {
        registeredCount: newCount
      });
      alert(`บันทึกช้อมูลผู้เข้าอบรมย้อนหลังเรียบร้อยสำหรับ ${retroForm.name} 🎉`);
      setRetroForm({ personnelId: '', name: '', email: '', department: '', checkedIn: true });
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลย้อนหลัง: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleToggleCheckInManual = async (reg: Registration) => {
    try {
      const isCheckedIn = !reg.checkedIn;
      await updateDoc(doc(db, 'registrations', reg.id), {
        checkedIn: isCheckedIn,
        checkedInAt: isCheckedIn ? new Date().toISOString() : null
      });
      alert(`เปลี่ยนสถานะเรียบร้อย: ${reg.name} -> ${isCheckedIn ? 'ผ่าน (เช็คอินแล้ว)' : 'ไม่ผ่าน (ยังไม่มีประวัติเช็คอิน)'}`);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Download registrations who actually checked in
  const handleDownloadActualAttendees = () => {
    if (!selectedCourseId) {
      alert('กรุณาเลือกหลักสูตรที่ต้องการประมวลผลก่อนดาวน์โหลดค่ะ');
      return;
    }
    const selCourse = courses.find(c => c.id === selectedCourseId);
    const matched = registrations
      .filter(r => r.courseId === selectedCourseId && r.checkedIn)
      .sort((a, b) => {
        const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        return timeA - timeB;
      });
    if (matched.length === 0) {
      alert('ยังไม่มีรายชื่อผู้เข้าอบรมจริงและผ่านเกณฑ์เช็คอินในวิชานี้ค่ะ');
      return;
    }
    const headers = ['ลำดับ', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'สังกัด/ฝ่าย', 'อีเมล', 'สถานะการเช็คอิน', 'วันเวลาสแกนเข้ารูปแบบ'];
    const rows = matched.map((m, idx) => {
      const p = personnel.find(x => (m.personnelId && x.id === m.personnelId) || (m.email && x.email && x.email.toLowerCase() === m.email.toLowerCase()));
      const pos = p?.position || m.position || '-';
      return [
        String(idx + 1).padStart(2, '0'),
        m.personnelId,
        getParticipantDisplayName(m.email, m.personnelId, m.name),
        pos,
        m.department,
        m.email,
        'เช็คอินแล้ว (อบรมเสร็จสิ้น)',
        m.checkedInAt ? new Date(m.checkedInAt).toLocaleString('th-TH') : '-'
      ];
    });
    downloadCSV(`รายชื่อผู้มาอบรมจริง_${selCourse?.title || 'หลักสูตร'}.csv`, headers, rows);
  };

  // Download registrations feedback results
  const handleDownloadEvaluations = () => {
    if (!selectedCourseId) {
      alert('กรุณาเลือกหลักสูตรที่ต้องการดาวน์โหลดรายงานผลประเมินค่ะ');
      return;
    }
    const selCourse = courses.find(c => c.id === selectedCourseId);
    const matched = registrations
      .filter(r => r.courseId === selectedCourseId && r.feedback)
      .sort((a, b) => {
        const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        return timeA - timeB;
      });
    if (matched.length === 0) {
      alert('ยังไม่พบคณาจารย์ที่ส่งแบบฟอร์มประเมินผลกลับเข้ามาวิเคราะห์ในหลักสูตรนี้ค่ะ');
      return;
    }

    const evalConfig = selCourse?.customEvaluationConfig || globalEvaluationConfig;
    const part3Qs = evalConfig?.part3Questions || [];

    const headers = [
      'รหัสบุคลากร',
      'ชื่อ-นามสกุล',
      'อีเมล',
      'หน่วยงาน (สังกัดที่ลงทะเบียน)',
      'สังกัด (ที่ตอบกลับประเมิน)',
      'ความรู้ความเข้าใจก่อนอบรม (1-5)',
      'ความรู้ความเข้าใจหลังอบรม (1-5)',
      'คะแนนความพึงพอใจโดยรวม (1-5)',
      'คะแนนแนะนำต่อ (1-5)',
      'ความคิดเห็น/ข้อเสนอแนะเพิ่มเติม',
      ...part3Qs.map((q, idx) => `ส่วนที่ 3 ข้อที่ ${idx + 1}: ${q.text}`)
    ];

    const rows = matched.map(m => {
      const p = personnel.find(x => (m.personnelId && x.id === m.personnelId) || (m.email && x.email && x.email.toLowerCase() === m.email.toLowerCase()));
      const pId = p?.id || m.personnelId || '-';
      const pName = p?.name || m.name || '-';
      const pEmail = p?.email || m.email || '-';
      const pDept = p?.department || m.department || '-';

      const affiliationDisplay = m.feedback?.affiliation === 'อื่นๆ' && m.feedback?.affiliationOther
        ? `อื่นๆ (${m.feedback.affiliationOther})`
        : (m.feedback?.affiliation || pDept || '');

      const part3Answers = part3Qs.map(q => {
        const val = m.feedback?.answers?.[q.id]
          ?? (q.id === 'q1' ? m.feedback?.satisfaction : undefined)
          ?? (q.id === 'q8' ? m.feedback?.satisfaction : undefined)
          ?? (q.id === 'q9' ? m.feedback?.comments : undefined);
        return val !== undefined ? String(val) : '-';
      });

      return [
        pId,
        pName,
        pEmail,
        pDept,
        affiliationDisplay,
        m.feedback?.part2Before !== undefined ? String(m.feedback.part2Before) : '-',
        m.feedback?.part2After !== undefined ? String(m.feedback.part2After) : '-',
        m.feedback?.satisfaction !== undefined ? String(m.feedback.satisfaction) : '-',
        m.feedback?.recommendation !== undefined ? String(m.feedback.recommendation) : '-',
        m.feedback?.comments || '-',
        ...part3Answers
      ];
    });

    downloadCSV(`รายงานผลการประเมิน_${selCourse?.title || 'หลักสูตร'}.csv`, headers, rows);
  };

  // Download all personnel as CSV database
  const handleDownloadPersonnelDatabase = () => {
    if (personnel.length === 0) {
      alert('ไม่พบรายชื่อบุคลากรในฐานข้อมูลขณะนี้ค่ะ');
      return;
    }
    const headers = ['รหัสบุคคล', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'หลักสูตร', 'ภาควิชา', 'หน่วยงาน', 'อีเมล', 'โทรศัพท์'];
    const sorted = [...personnel].sort((a, b) => 
      (a.id || '').trim().localeCompare((b.id || '').trim(), undefined, { numeric: true, sensitivity: 'base' })
    );
    const rows = sorted.map(p => [
      p.id,
      p.name,
      p.position || '-',
      getDisplayCurriculum(p.curriculum, p.department),
      p.academicDepartment || '-',
      p.department || '-',
      p.email || '-',
      p.phone || '-'
    ]);
    downloadCSV('ฐานข้อมูลบุคลากรทั้งหมด.csv', headers, rows);
  };

  // Manually register a participant and dispatch confirmation email
  const handleSaveManualRegistration = async () => {
    setManualRegisterError('');
    if (!selectedCourseId) {
      setManualRegisterError('กรุณาเลือกหลักสูตรฝึกอบรม');
      return;
    }
    const selCourse = courses.find(c => c.id === selectedCourseId);
    if (!selCourse) {
      setManualRegisterError('ไม่พบข้อมูลหลักสูตรที่เลือก');
      return;
    }

    const { personnelId, name, email, department } = manualRegisterForm;

    if (!personnelId.trim() || !name.trim() || !email.trim() || !department.trim()) {
      setManualRegisterError('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.endsWith('@bu.ac.th')) {
      setManualRegisterError('อีเมลต้องลงท้ายด้วย @bu.ac.th เท่านั้นเพื่อความปลอดภัยและถูกต้อง');
      return;
    }

    const regId = `${selectedCourseId}_${cleanEmail.replace(/\./g, '_')}`;

    // check if already registered
    const isAlreadyReg = registrations.some(r => r.courseId === selectedCourseId && r.email.toLowerCase() === cleanEmail);
    if (isAlreadyReg) {
      setManualRegisterError('บุคลากรท่านนี้ได้ลงทะเบียนในคอร์สนี้แล้ว');
      return;
    }

    setManualRegisterSubmitting(true);

    try {
      const newReg: Registration = {
        id: regId,
        courseId: selectedCourseId,
        email: cleanEmail,
        personnelId: personnelId.trim(),
        name: name.trim(),
        department: department.trim(),
        registeredAt: new Date().toISOString(),
        checkedIn: false
      };

      // save to firestore
      await setDoc(doc(db, 'registrations', regId), newReg);

      // increment registeredCount on course
      const newCount = (selCourse.registeredCount || 0) + 1;
      await updateDoc(doc(db, 'courses', selectedCourseId), {
        registeredCount: newCount
      });

      // --- Send automated registration email (เหมือนเดิมกับที่ระบบผู้เข้าอบรมทำ) ---
      // Replace tokens for the template
      const replaceTokens = (text: string) => {
        if (!text) return '';
        const regLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}`;
        const surveyLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}&action=feedback&learner=${encodeURIComponent(cleanEmail)}`;
        const posterUrl = selCourse.posterUrl || '';
        
        let posterHtml = '';
        if (posterUrl) {
          posterHtml = `
            <div style="text-align: center; margin: 20px 0;">
              <img src="${posterUrl}" alt="${selCourse.title}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" />
            </div>
          `;
        }

        return text
          .replace(/{learner_name}/g, name.trim())
          .replace(/{course_title}/g, selCourse.title)
          .replace(/{course_date}/g, selCourse.date)
          .replace(/{course_time}/g, selCourse.time)
          .replace(/{course_location}/g, selCourse.location)
          .replace(/{course_description}/g, selCourse.description || '')
          .replace(/{register_link}/g, regLink)
          .replace(/{survey_link}/g, surveyLink)
          .replace(/{course_poster_url}/g, posterUrl)
          .replace(/{course_poster_html}/g, posterHtml)
          .replace(/{course_poster}/g, posterHtml);
      };

      const posterAttach = getPosterAttachmentData(selCourse.posterUrl || '');
      let finalHtml = replaceTokens(registerHtml || DEFAULT_REGISTER_HTML);
      if (posterAttach && selCourse.posterUrl) {
        finalHtml = finalHtml.split(selCourse.posterUrl).join('cid:course_poster_cid');
      }

      const emailPayload = {
        action: 'register',
        email: cleanEmail,
        name: name.trim(),
        courseTitle: selCourse.title,
        date: selCourse.date,
        time: selCourse.time,
        location: selCourse.location,
        subject: replaceTokens(registerSubject || DEFAULT_REGISTER_SUBJECT),
        htmlBody: finalHtml,
        ...(posterAttach ? {
          inlinePosterBase64: posterAttach.inlinePosterBase64,
          inlinePosterContentType: posterAttach.inlinePosterContentType
        } : {})
      };

      if (gasUrl) {
        try {
          await sendGasWebhook(gasUrl, emailPayload);
          console.log('Admin manual registration email sent via GAS successfully.');
          alert(`เพิ่มผู้เข้าอบรมสำเร็จ 🎉\nระบบได้ทำการลงทะเบียนเรียนหลักสูตร "${selCourse.title}" ให้กับคุณ ${name.trim()} พร้อมจัดส่งอีเมลแจ้งยืนยันการเข้าร่วมอบรม และส่งคำเชิญลง Google Calendar ให้เรียบร้อยแล้วค่ะ`);
        } catch (gasErr: any) {
          console.error('GAS connection failed for admin manual registration:', gasErr);
          alert(`เพิ่มผู้เข้าอบรมในระบบสำเร็จ 🎉 (หลักสูตร: ${selCourse.title})\n\n⚠️ คำเตือนการจัดส่งอีเมล:\nระบบบันทึกการลงทะเบียนเรียบร้อยแล้ว แต่ไม่สามารถจัดส่งอีเมลยืนยันไปยัง "${cleanEmail}" ได้:\n${gasErr?.message || 'โปรดตรวจสอบโควต้าอีเมลของบัญชีผู้ส่ง หรือ URL ของ Webhook'}`);
        }
      } else {
        console.warn('--- REGISTRATION EMAIL & CALENDAR SIMULATION (No GAS App URL provided) ---');
        console.warn(`Sent registration confirmation and Google Calendar invitation to ${cleanEmail} for "${selCourse.title}"`);
        alert(`เพิ่มผู้เข้าอบรมสำเร็จ 🎉\n[โหมดทดลองจำลอง] ระบบได้บันทึกข้อมูลร่วมอบรมของ ${name.trim()} สำเร็จ และจำลองส่งเมลปฏิทินกับใบยืนยันให้ทางอีเมลแล้วเรียบร้อยค่ะ`);
      }

      // Reset Form & Close Modal
      setManualRegisterForm({ personnelId: '', name: '', email: '', department: '' });
      setShowManualRegisterModal(false);
    } catch (err) {
      console.error(err);
      setManualRegisterError('เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้เข้าอบรม: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setManualRegisterSubmitting(false);
    }
  };

  // Helper to securely persist campaign/dispatch logs to Firestore and local backup
  const saveCampaignLog = async (logToSave: CampaignLog) => {
    // 1. Sanitize to strip any `undefined` values which Firestore strictly forbids
    const cleanedLog = cleanForFirestore(logToSave);

    // 2. Immediately update local state so the history table updates in real time
    setCampaignLogs(prev => {
      const filtered = prev.filter(l => l.id !== cleanedLog.id);
      return [cleanedLog, ...filtered];
    });

    // 3. Persist to localStorage backup
    try {
      const existingStr = localStorage.getItem('backup_campaign_logs') || '[]';
      const existing = JSON.parse(existingStr);
      const updated = [cleanedLog, ...existing.filter((item: any) => item.id !== cleanedLog.id)];
      localStorage.setItem('backup_campaign_logs', JSON.stringify(updated.slice(0, 100)));
    } catch (e) {
      console.warn("Failed to save campaign log to localStorage", e);
    }

    // 4. Persist to Firestore
    try {
      await setDoc(doc(db, 'campaign_logs', cleanedLog.id), cleanedLog);
      console.log(`[Campaign Log] Saved ${cleanedLog.id} successfully to Firestore.`);
    } catch (err) {
      console.error(`[Campaign Log Error] Failed saving ${cleanedLog.id} to Firestore:`, err);
      handleFirestoreError(err, OperationType.WRITE, `campaign_logs/${cleanedLog.id}`);
    }
  };

  // Reusable bulk e-mail sender loop utilizing the user's Google Apps Script url
  const handleSendBulkEmailGroup = async (recipientsList: Registration[], emailSubject: string, emailMessage: string, isCertificate: boolean = false) => {
    if (recipientsList.length === 0) {
      alert('ไม่มีผู้รับเป้าหมายที่ตรงเกณฑ์การคัดเลือกในการจัดส่งจดหมายขณะนี้ค่ะ');
      return;
    }
    setSendingBulkEmail(true);
    let successCount = 0;
    let failCount = 0;
    let lastDispatchError = '';
    try {
      const selCourse = courses.find(c => c.id === selectedCourseId);
      const isGroupTo = modalSendType === 'group_to';
      const isGroupBcc = modalSendType === 'group_bcc';

      if (isGroupTo || isGroupBcc) {
        alert(`🚀 เริ่มต้นจัดส่งจดหมายอิเล็กทรอนิกส์แบบกลุ่มรวมให้กับผู้ใช้ทั้งหมด ${recipientsList.length} คนในวิชาสัมมนาปัจจุบัน...`);
        const emailList = recipientsList.map(r => r.email).filter(Boolean);
        
        // Define a generic replacer for group template variables
        const replaceAll = (text: string) => {
          if (!text) return '';
          const regLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}`;
          const surveyLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}&action=feedback`;
          const certLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}&action=certificate`;
          const posterUrl = selCourse?.posterUrl || '';
          
          let posterHtml = '';
          if (posterUrl) {
            posterHtml = `
              <div style="text-align: center; margin: 20px 0;">
                <img src="${posterUrl}" alt="${selCourse?.title || 'อบรมสัมมนา'}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" />
              </div>
            `;
          }

          let cleaned = text
            .replace(/เรียน\s*อาจารย์\s*(\{name\}|\{recipient_name\}|บุคลากรทุกท่าน|ผู้ร่วมอบรมทุกท่าน)/gi, 'เรียน อาจารย์ทุกท่าน')
            .replace(/เรียน\s*(\{name\}|\{recipient_name\})/gi, 'เรียน อาจารย์ทุกท่าน')
            .replace(/เรียน\s*อาจารย์\s*และ\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน')
            .replace(/เรียน\s*อาจารย์\s*\/\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน')
            .replace(/เรียน\s*อาจารย์\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน')
            .replace(/เรียน\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน');

          return cleaned
            .replace(/{learner_name}/g, 'อาจารย์ทุกท่าน')
            .replace(/{name}/g, 'ทุกท่าน')
            .replace(/{recipient_name}/g, 'ทุกท่าน')
            .replace(/{id}/g, '')
            .replace(/{personnel_id}/g, '')
            .replace(/{department}/g, 'มหาวิทยาลัยกรุงเทพ')
            .replace(/{course_title}/g, selCourse?.title || '')
            .replace(/{course_id}/g, selectedCourseId || '')
            .replace(/{email}/g, '')
            .replace(/{course_date}/g, selCourse?.date || '')
            .replace(/{course_time}/g, selCourse?.time || '')
            .replace(/{course_location}/g, selCourse?.location || '')
            .replace(/{course_description}/g, selCourse?.description || '')
            .replace(/{date_time}/g, selCourse ? `${selCourse.date} (${selCourse.time})` : '')
            .replace(/{location}/g, selCourse?.location || '')
            .replace(/{speaker}/g, selCourse?.speaker || '')
            .replace(/{register_link}/g, regLink)
            .replace(/{survey_link}/g, surveyLink)
            .replace(/{learner_certificate_link}/g, certLink)
            .replace(/{course_poster_url}/g, posterUrl)
            .replace(/{course_poster_html}/g, posterHtml)
            .replace(/{course_poster}/g, posterHtml);
        };

        let msg = replaceAll(emailMessage);
        if (isCertificate && !msg.includes('ดาวน์โหลดใบเกียรติบัตร') && !msg.includes('certificate')) {
          msg += `\n\n🎓 ลิงก์ดาวน์โหลดใบเกียรติบัตรรับรองสำเร็จ: ${getCleanOrigin()}/?courseId=${selectedCourseId}&action=certificate`;
        }

        let personalizedSubject = replaceAll(emailSubject);
        const formattedMsgHtml = msg.replace(/\n/g, '<br/>');
        const emailHtmlBody = `
          <div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
            <div style='text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%); padding: 20px; border-radius: 8px; color: #ffffff;'>
              <h3 style='margin: 0; font-size: 17px; font-weight: 800;'>ระบบบริหารจัดการการอบรม</h3>
              <p style='margin: 5px 0 0 0; font-size: 11px; opacity: 0.9;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
            </div>
            
            <div style='font-size: 14px; color: #475569; line-height: 1.6;'>
              ${formattedMsgHtml}
            </div>
            
            <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
            <div style='text-align: center;'>
              <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลแจ้งเตือนอัตโนมัติจากระบบบริการบุคลากร มหาวิทยาลัยกรุงเทพ</p>
            </div>
          </div>
        `;

        const posterUrl = selCourse?.posterUrl || '';
        const posterAttach = getPosterAttachmentData(posterUrl);
        let finalHtml = emailHtmlBody;
        if (posterAttach && posterUrl) {
          finalHtml = finalHtml.split(posterUrl).join('cid:course_poster_cid');
        }

        const batchSize = 100;
        const totalRecipients = emailList.length;

        for (let j = 0; j < totalRecipients; j += batchSize) {
          const batchEmails = emailList.slice(j, j + batchSize);
          if (gasUrl) {
            const payload = {
              action: 'campaign_invitation',
              email: isGroupTo ? batchEmails.join(",") : (userEmail || 'buqa@bu.ac.th'),
              ...(isGroupTo ? {} : { bccEmails: batchEmails }),
              ccEmail: modalCcAdmin ? (modalCcEmails.length > 0 ? modalCcEmails.join(",") : (userEmail || 'buqa@bu.ac.th')) : undefined,
              subject: personalizedSubject,
              messageText: msg.replace(/<[^>]*>/g, ''),
              htmlBody: finalHtml,
              ...(posterAttach ? {
                inlinePosterBase64: posterAttach.inlinePosterBase64,
                inlinePosterContentType: posterAttach.inlinePosterContentType
              } : {})
            };
            try {
              const gasRes = await sendGasWebhook(gasUrl, payload);
              const actualCount = typeof gasRes.count === 'number' ? gasRes.count : (batchEmails.length - (gasRes.failedCount || 0));
              successCount += actualCount;
              if (gasRes.failedCount && gasRes.failedCount > 0) {
                failCount += gasRes.failedCount;
              }
            } catch (batchErr: any) {
              console.error('Group dispatch error:', batchErr);
              failCount += batchEmails.length;
              lastDispatchError = batchErr?.message || String(batchErr);
            }
          } else {
            console.log(`[Offline Simulation Mailer Group] Sent to: ${isGroupTo ? batchEmails.join(",") : 'BCC-Group'} | Subject: ${personalizedSubject}`);
            successCount += batchEmails.length;
          }
        }
        if (failCount > 0 && successCount > 0) {
          alert(`⚠️ [จัดส่งเสร็จสิ้นบางส่วน]\n- ส่งสำเร็จ: ${successCount} รายการ\n- ล้มเหลว: ${failCount} รายการ\n\nสาเหตุ: ${lastDispatchError || 'โปรดตรวจสอบโควต้าอีเมล'}`);
        } else if (failCount > 0 && successCount === 0) {
          alert(`❌ [การจัดส่งล้มเหลวทั้งหมด (${failCount} รายการ)]\n\nสาเหตุ: ${lastDispatchError || 'Google Apps Script ไม่สามารถส่งอีเมลได้ โปรดตรวจสอบโควต้าหรือสิทธิ์'}`);
        } else {
          alert(`🎉 [จัดส่งสำเร็จสมบูรณ์] ระบบได้ทำการจัดแจงส่งอีเมลใบประกาศ/แบบประเมินหลักฐานแบบกลุ่มไปหาผู้รับครบ ${successCount} รายการเรียบร้อยแล้วค่ะ!`);
        }
      } else {
        alert(`🚀 เริ่มต้นจัดส่งจดหมายอิเล็กทรอนิกส์แบบทีละบุคคลให้กับผู้ใช้ทั้งหมด ${recipientsList.length} คนในวิชาสัมมนาปัจจุบัน...`);
        for (const item of recipientsList) {
          const replaceAll = (text: string) => {
            if (!text) return '';
            const regLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}`;
            const surveyLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}&action=feedback&learner=${encodeURIComponent(item.email)}`;
            const certLink = `${getCleanOrigin()}/?courseId=${selectedCourseId}&action=certificate&learner=${encodeURIComponent(item.email)}`;
            const posterUrl = selCourse?.posterUrl || '';
            
            let posterHtml = '';
            if (posterUrl) {
              posterHtml = `
                <div style="text-align: center; margin: 20px 0;">
                  <img src="${posterUrl}" alt="${selCourse?.title || 'อบรมสัมมนา'}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" />
                </div>
              `;
            }

            return text
              .replace(/{learner_name}/g, item.name || '')
              .replace(/{name}/g, item.name || '')
              .replace(/{id}/g, item.personnelId || '')
              .replace(/{personnel_id}/g, item.personnelId || '')
              .replace(/{department}/g, item.department || '')
              .replace(/{course_title}/g, selCourse?.title || '')
              .replace(/{course_id}/g, selectedCourseId || '')
              .replace(/{email}/g, item.email || '')
              .replace(/{course_date}/g, selCourse?.date || '')
              .replace(/{course_time}/g, selCourse?.time || '')
              .replace(/{course_location}/g, selCourse?.location || '')
              .replace(/{course_description}/g, selCourse?.description || '')
              .replace(/{date_time}/g, selCourse ? `${selCourse.date} (${selCourse.time})` : '')
              .replace(/{location}/g, selCourse?.location || '')
              .replace(/{speaker}/g, selCourse?.speaker || '')
              .replace(/{register_link}/g, regLink)
              .replace(/{survey_link}/g, surveyLink)
              .replace(/{learner_certificate_link}/g, certLink)
              .replace(/{course_poster_url}/g, posterUrl)
              .replace(/{course_poster_html}/g, posterHtml)
              .replace(/{course_poster}/g, posterHtml);
          };

          let msg = replaceAll(emailMessage);
          if (isCertificate && !msg.includes('ดาวน์โหลดใบเกียรติบัตร') && !msg.includes('certificate')) {
            msg += `\n\n🎓 ลิงก์ดาวน์โหลดใบเกียรติบัตรรับรองสำเร็จของคุณ: ${getCleanOrigin()}/?courseId=${selectedCourseId}&action=certificate&learner=${encodeURIComponent(item.email)}`;
          }

          let personalizedSubject = replaceAll(emailSubject);
          const formattedMsgHtml = msg.replace(/\n/g, '<br/>');
          const emailHtmlBody = `
            <div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
              <div style='text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%); padding: 20px; border-radius: 8px; color: #ffffff;'>
                <h3 style='margin: 0; font-size: 17px; font-weight: 800;'>ระบบบริหารจัดการการอบรม</h3>
                <p style='margin: 5px 0 0 0; font-size: 11px; opacity: 0.9;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
              </div>
              
              <div style='font-size: 14px; color: #475569; line-height: 1.6;'>
                ${formattedMsgHtml}
              </div>
              
              <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
              <div style='text-align: center;'>
                <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลแจ้งเตือนอัตโนมัติจากระบบบริการบุคลากร มหาวิทยาลัยกรุงเทพ</p>
              </div>
            </div>
          `;

          const posterUrl = selCourse?.posterUrl || '';
          const posterAttach = getPosterAttachmentData(posterUrl);
          let finalHtml = emailHtmlBody;
          if (posterAttach && posterUrl) {
            finalHtml = finalHtml.split(posterUrl).join('cid:course_poster_cid');
          }

          let itemSuccess = false;
          if (gasUrl) {
            const payload = {
              action: 'campaign_invitation',
              email: item.email,
              ccEmail: modalCcAdmin ? (modalCcEmails.length > 0 ? modalCcEmails.join(",") : (userEmail || 'buqa@bu.ac.th')) : undefined,
              subject: personalizedSubject,
              messageText: msg.replace(/<[^>]*>/g, ''),
              htmlBody: finalHtml,
              ...(posterAttach ? {
                inlinePosterBase64: posterAttach.inlinePosterBase64,
                inlinePosterContentType: posterAttach.inlinePosterContentType
              } : {})
            };
            try {
              await sendGasWebhook(gasUrl, payload);
              itemSuccess = true;
            } catch (indErr: any) {
              console.error(`Failed to send to ${item.email}:`, indErr);
              lastDispatchError = indErr?.message || String(indErr);
            }
          } else {
            console.log(`[Offline Simulation Mailer] Sent to: ${item.email} | Subject: ${personalizedSubject}`);
            itemSuccess = true;
          }

          if (itemSuccess) {
            successCount++;
          } else {
            failCount++;
          }
        }
        if (failCount > 0 && successCount > 0) {
          alert(`⚠️ [จัดส่งเสร็จสิ้นบางส่วน]\n- ส่งสำเร็จ: ${successCount} รายการ\n- ล้มเหลว: ${failCount} รายการ\n\nสาเหตุ: ${lastDispatchError || 'โปรดตรวจสอบโควต้าอีเมล'}`);
        } else if (failCount > 0 && successCount === 0) {
          alert(`❌ [การจัดส่งล้มเหลวทั้งหมด (${failCount} รายการ)]\n\nสาเหตุ: ${lastDispatchError || 'Google Apps Script ไม่สามารถส่งอีเมลได้ โปรดตรวจสอบโควต้าหรือสิทธิ์'}`);
        } else {
          alert(`🎉 [จัดส่งสำเร็จสมบูรณ์] ระบบได้ทำการจัดแจงส่งอีเมลใบประกาศ/แบบประเมินหลักฐานแบบเดี่ยวไปหาผู้รับจริงครบ ${successCount} รายการเรียบร้อยแล้วค่ะ!`);
        }
      }

      // Automatically record dispatch history log for bulk/action emails
      try {
        const logId = `bulk_${Date.now()}`;
        let actionLabel = 'ส่งอีเมลแบบกลุ่ม';
        let targetTypeKey: 'bulk_certificate' | 'bulk_reminder' | 'bulk_evaluation' | 'bulk_group' = 'bulk_group';
        if (isCertificate) {
          actionLabel = 'ส่งใบประกาศนียบัตร';
          targetTypeKey = 'bulk_certificate';
        } else if (showReminderModal) {
          actionLabel = 'ส่งแจ้งเตือนก่อนอบรม';
          targetTypeKey = 'bulk_reminder';
        } else if (showEvaluationModal) {
          actionLabel = 'ส่งลิงก์แบบประเมิน';
          targetTypeKey = 'bulk_evaluation';
        }

        const bulkLog: CampaignLog = {
          id: logId,
          courseId: selectedCourseId || '',
          courseTitle: selCourse?.title || 'กิจกรรมอบรมสัมมนา',
          subject: emailSubject,
          message: emailMessage,
          targetType: targetTypeKey,
          targetDetails: `${actionLabel}: ${recipientsList.length} คน`,
          recipientsCount: recipientsList.length,
          successCount: successCount,
          failCount: Math.max(0, recipientsList.length - successCount),
          sentAt: new Date().toISOString(),
          sentBy: userEmail || 'buqa@bu.ac.th',
          sendType: modalSendType,
          logs: [
            `[${actionLabel}] จัดส่งสำเร็จเมื่อ ${new Date().toLocaleString('th-TH')}`,
            `ผู้ดำเนินการ: ${userEmail || 'buqa@bu.ac.th'}`,
            `จำนวนผู้รับทั้งหมด: ${recipientsList.length} คน (สำเร็จ ${successCount} คน)`
          ],
          recipientEmails: recipientsList.map(r => r.email).filter(Boolean),
          recipientIds: recipientsList.map(r => r.personnelId || r.id),
          recipientsSnapshot: recipientsList.map(r => ({
            id: r.personnelId || r.id,
            name: r.name,
            email: r.email,
            position: r.position || '',
            department: r.department || ''
          }))
        };
        await saveCampaignLog(bulkLog);
      } catch (logErr) {
        console.warn("Could not save bulk email history log:", logErr);
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อความติดขัดในการเผยแพร่จดหมายสัมมนา: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSendingBulkEmail(false);
      setShowReminderModal(false);
      setShowEvaluationModal(false);
      setShowCertificateModal(false);
    }
  };

  const handleDeleteRegistrationManual = (reg: Registration, course: Course) => {
    requestConfirmation(
      'ยืนยันลบชื่อผู้เข้าร่วม',
      `คุณแน่ใจหรือไม่ที่จะลบรายชื่อ ${reg.name} ออกจากกิจกรรมการอบรมนี้?`,
      async () => {
        try {
          await deleteDoc(doc(db, 'registrations', reg.id));
          // Decrement registeredCount
          const newCount = Math.max(0, (course.registeredCount || 0) - 1);
          await updateDoc(doc(db, 'courses', course.id), {
            registeredCount: newCount
          });
          alert('ลบรายชื่อออกจากวิชานี้สำเร็จแล้ว');
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการลบรายชื่อ: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  const handleStartEditRegistration = (reg: Registration) => {
    const p = personnel.find(x => (reg.personnelId && x.id === reg.personnelId) || (reg.email && x.email && x.email.toLowerCase() === reg.email.toLowerCase()));
    setEditingRegistration(reg);
    setEditRegForm({
      personnelId: reg.personnelId || '',
      name: reg.name || '',
      position: reg.position || p?.position || '',
      email: reg.email || '',
      department: reg.department || '',
      checkedIn: reg.checkedIn || false
    });
  };

  const handleSaveRegistrationEdit = async () => {
    if (!editingRegistration) return;
    if (!editRegForm.email || !editRegForm.name || !editRegForm.personnelId || !editRegForm.department) {
      alert('กรุณากรอกข้อมูลผู้เข้าร่วมอบรมให้ครบทุกช่อง');
      return;
    }

    if (!editRegForm.email.endsWith('@bu.ac.th')) {
      alert('อีเมลต้องลงท้ายด้วยโดเมน @bu.ac.th เท่านั้นเพื่อความถูกต้องของฐานข้อมูล');
      return;
    }

    const oldEmail = editingRegistration.email.toLowerCase().trim();
    const newEmail = editRegForm.email.toLowerCase().trim();
    const newRegId = `${editingRegistration.courseId}_${newEmail.replace(/\./g, '_')}`;

    try {
      if (oldEmail !== newEmail) {
        // Check if the new email is already registered in the SAME course (excluding this one)
        const isAlreadyReg = registrations.some(
          r => r.courseId === editingRegistration.courseId && 
          r.email.toLowerCase() === newEmail && 
          r.id !== editingRegistration.id
        );
        if (isAlreadyReg) {
          alert('อีเมลใหม่นี้ได้ลงทะเบียนในคอร์สนี้แล้ว กรุณาใช้อีเมลอื่นหรือยกเลิกการแก้ไข');
          return;
        }

        const updatedReg: Registration = {
          ...editingRegistration,
          id: newRegId,
          email: newEmail,
          personnelId: editRegForm.personnelId,
          name: editRegForm.name,
          position: editRegForm.position || '-',
          department: editRegForm.department,
          checkedIn: editRegForm.checkedIn,
          checkedInAt: editRegForm.checkedIn 
            ? (editingRegistration.checkedInAt || new Date().toISOString()) 
            : null
        };

        await setDoc(doc(db, 'registrations', newRegId), updatedReg);
        await deleteDoc(doc(db, 'registrations', editingRegistration.id));
      } else {
        const updatedReg: Registration = {
          ...editingRegistration,
          personnelId: editRegForm.personnelId,
          name: editRegForm.name,
          position: editRegForm.position || '-',
          department: editRegForm.department,
          checkedIn: editRegForm.checkedIn,
          checkedInAt: editRegForm.checkedIn 
            ? (editingRegistration.checkedInAt || new Date().toISOString()) 
            : null
        };
        await setDoc(doc(db, 'registrations', editingRegistration.id), updatedReg);
      }

      alert('แก้ไขข้อมูลร่วมอบรมสำเร็จ 🎉');
      setEditingRegistration(null);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกการแก้ไข: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleStartEditAdmin = (admin: Admin) => {
    setEditingAdminState(admin);
    setEditAdminForm({
      email: admin.email,
      name: admin.name,
      role: admin.role,
      staffId: admin.staffId || '',
      position: admin.position || '',
      department: admin.department || '',
      phone: admin.phone || ''
    });
  };

  const handleSaveAdminEdit = async () => {
    if (!editingAdminState) return;
    if (!editAdminForm.name || !editAdminForm.email) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    if (!editAdminForm.email.endsWith('@bu.ac.th')) {
      alert('อีเมลต้องลงท้ายด้วย @bu.ac.th เท่านั้นเพื่อความถูกต้องของฐานข้อมูล');
      return;
    }

    const oldEmail = editingAdminState.email.toLowerCase().trim();
    const newEmail = editAdminForm.email.toLowerCase().trim();

    try {
      if (oldEmail !== newEmail) {
        // Check local state cache to see if the admin already exists
        const isAlreadyAdmin = adminsList.some(adm => adm.email.toLowerCase() === newEmail);
        if (isAlreadyAdmin) {
          alert('อีเมลใหม่นี้ได้รับการแต่งตั้งในฐานะผู้บริหารระบบอยู่แล้ว');
          return;
        }

        const newAdmin: Admin = {
          email: newEmail,
          name: editAdminForm.name,
          role: 'Admin',
          assignedAt: editingAdminState.assignedAt || new Date().toISOString(),
          assignedBy: editingAdminState.assignedBy || userEmail,
          staffId: editAdminForm.staffId,
          position: editAdminForm.position,
          department: editAdminForm.department,
          phone: editAdminForm.phone
        };

        await setDoc(doc(db, 'admins', newEmail), newAdmin);
        await deleteDoc(doc(db, 'admins', oldEmail));
      } else {
        const updatedAdmin: Admin = {
          ...editingAdminState,
          name: editAdminForm.name,
          role: 'Admin',
          staffId: editAdminForm.staffId,
          position: editAdminForm.position,
          department: editAdminForm.department,
          phone: editAdminForm.phone
        };
        await setDoc(doc(db, 'admins', oldEmail), updatedAdmin);
      }

      alert('แก้ไขข้อมูลแอดมินเจ้าหน้าที่สำเร็จ 🎉');
      setEditingAdminState(null);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Personnel CRUD
  const handleSavePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personnelForm.id || !personnelForm.name || !personnelForm.department || !personnelForm.email) {
      alert('กรุณากรอกข้อมูลบุคลากรให้ครบหลัก');
      return;
    }

    if (!personnelForm.email.endsWith('@bu.ac.th')) {
      alert('อีเมลของอาจารย์/บุคลากร ต้องลงท้ายด้วยโดเมน @bu.ac.th เท่านั้นเพื่อคงความถูกต้องระดับเขตข้อมูล (Data Integrity)');
      return;
    }

    const inputIdNorm = personnelForm.id.trim().toLowerCase();
    const inputEmailNorm = personnelForm.email.toLowerCase().trim();

    const existing = personnel.find(p => 
      (inputIdNorm && p.id && p.id.trim().toLowerCase() === inputIdNorm) ||
      (inputEmailNorm && p.email && p.email.trim().toLowerCase() === inputEmailNorm)
    );
    const isEditMode = !!editingPersonnelId;
    const targetId = isEditMode ? editingPersonnelId : (existing ? existing.id : personnelForm.id.trim());

    const data: Personnel = {
      id: targetId,
      name: personnelForm.name.trim(),
      position: personnelForm.position?.trim() || '-',
      curriculum: getDisplayCurriculum(personnelForm.curriculum, personnelForm.department),
      academicDepartment: personnelForm.academicDepartment?.trim() || '-',
      department: personnelForm.department.trim(),
      email: inputEmailNorm,
      phone: personnelForm.phone?.trim() || '-',
      createdAt: (isEditMode && existing) ? (existing.createdAt || new Date().toISOString()) : (existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString())
    };

    try {
      await setDoc(doc(db, 'personnel', data.id), data);
      if (isEditMode) {
        alert('แก้ไขข้อมูลบุคลากรเรียบร้อยแล้วค่ะ 🎉');
      } else if (existing) {
        alert('พบข้อมูลบุคลากรเดิมในระบบ ทำการอัปเดตข้อมูลใหม่ให้ตรงกันเรียบร้อยแล้วค่ะ (รักษาข้อมูลเดิม) 🔄');
      } else {
        alert('บันทึกข้อมูลบุคลากรรายบุคคลสำเร็จ 🎉');
      }
      setPersonnelForm({ id: '', name: '', position: '', curriculum: '', academicDepartment: '', department: '', email: '', phone: '' });
      setShowPersonnelForm(false);
      setEditingPersonnelId(null);
    } catch (err) {
      console.error(err);
      alert('บันทึกผิดพลาด โปรดเช็คสิทธิ์แอดมินหรือความถูกต้องของข้อมูล');
    }
  };

  const handleEditPersonnel = (p: Personnel) => {
    setPersonnelForm({
      id: p.id,
      name: p.name,
      position: p.position || '',
      curriculum: getDisplayCurriculum(p.curriculum, p.department),
      academicDepartment: p.academicDepartment || '',
      department: p.department || '',
      email: p.email || '',
      phone: p.phone || ''
    });
    setEditingPersonnelId(p.id);
    setShowPersonnelForm(true);
  };

  const handleDeletePersonnel = (id: string) => {
    requestConfirmation(
      'ยืนยันลบข้อมูลบุคลากร',
      'คุณแน่ใจหรือไม่ที่จะลบชุดข้อมูลบุคลากรรายนี้? ข้อมูลการอบรมและสะสมแต้มผลงานอาจคลาดเคลื่อนหลังถูกถอนประวัติระบบ',
      async () => {
        try {
          await deleteDoc(doc(db, 'personnel', id));
          alert('ลบข้อมูลบุคลากรสำเร็จเรียบร้อย 🎉');
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  // Clean duplicate personnel in database
  const handleCleanSystemDuplicates = async () => {
    if (personnel.length === 0) {
      alert('ไม่พบข้อมูลบุคลากรในระบบให้ตรวจสอบค่ะ');
      return;
    }

    const map = new Map<string, Personnel[]>();
    personnel.forEach(p => {
      const normId = p.id ? p.id.trim().toLowerCase() : '';
      const normEmail = p.email ? p.email.trim().toLowerCase() : '';
      // Group duplicates by unique personnel ID primarily to protect distinct staff who share a department contact email
      const key = normId ? `id:${normId}` : (normEmail ? `email:${normEmail}` : '');
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(p);
    });

    const duplicatesToRemove: string[] = [];
    const updatesToCommit: { primaryId: string; data: Partial<Personnel> }[] = [];

    for (const [_, items] of map.entries()) {
      if (items.length === 1) {
        const primary = items[0];
        const cleanedCurr = getDisplayCurriculum(primary.curriculum, primary.department);
        if (cleanedCurr !== primary.curriculum) {
          updatesToCommit.push({
            primaryId: primary.id,
            data: { curriculum: cleanedCurr }
          });
        }
      } else if (items.length > 1) {
        // Sort items so the best ID (e.g. starting with A/C/6) and most complete record comes first
        items.sort((a, b) => {
          const aHasPrefix = /^[a-zA-Z]/.test(a.id || '');
          const bHasPrefix = /^[a-zA-Z]/.test(b.id || '');
          if (aHasPrefix && !bHasPrefix) return -1;
          if (!aHasPrefix && bHasPrefix) return 1;

          const aFields = (a.name ? 1 : 0) + (a.department ? 1 : 0) + (a.curriculum !== '-' ? 1 : 0) + (a.phone !== '-' ? 1 : 0);
          const bFields = (b.name ? 1 : 0) + (b.department ? 1 : 0) + (b.curriculum !== '-' ? 1 : 0) + (b.phone !== '-' ? 1 : 0);
          return bFields - aFields;
        });

        const primary = items[0];
        const secondary = items.slice(1);

        // Check if primary needs enrichment from secondary items
        let updatedCurr = primary.curriculum;
        let updatedPos = primary.position;
        let updatedDept = primary.department;
        let updatedPhone = primary.phone;

        secondary.forEach(sec => {
          if ((!updatedCurr || updatedCurr === '-') && sec.curriculum && sec.curriculum !== '-') {
            updatedCurr = sec.curriculum;
          }
          if ((!updatedPos || updatedPos === '-') && sec.position && sec.position !== '-') {
            updatedPos = sec.position;
          }
          if ((!updatedDept || updatedDept === 'ทั่วไป') && sec.department && sec.department !== 'ทั่วไป') {
            updatedDept = sec.department;
          }
          if ((!updatedPhone || updatedPhone === '-') && sec.phone && sec.phone !== '-') {
            updatedPhone = sec.phone;
          }

          if (sec.id && sec.id !== primary.id) {
            duplicatesToRemove.push(sec.id);
          }
        });

        updatedCurr = getDisplayCurriculum(updatedCurr, updatedDept);

        if (
          updatedCurr !== primary.curriculum ||
          updatedPos !== primary.position ||
          updatedDept !== primary.department ||
          updatedPhone !== primary.phone
        ) {
          updatesToCommit.push({
            primaryId: primary.id,
            data: {
              curriculum: updatedCurr,
              position: updatedPos,
              department: updatedDept,
              phone: updatedPhone
            }
          });
        }
      }
    }

    if (duplicatesToRemove.length === 0 && updatesToCommit.length === 0) {
      alert('✨ ระบบตรวจสอบเรียบร้อย ไม่พบข้อมูลบุคลากรซ้ำซ้อนในฐานข้อมูลค่ะ');
      return;
    }

    requestConfirmation(
      'คัดกรองและรวมข้อมูลซ้ำในระบบ',
      `ตรวจพบข้อมูลบุคลากรซ้ำซ้อนและสามารถปรับปรุงได้จำนวน ${duplicatesToRemove.length} รายการ ต้องการคัดกรองและรวมข้อมูลซ้ำเพื่อลบรายการส่วนเกินออกหรือไม่?`,
      async () => {
        try {
          const chunkSize = 300;
          for (let i = 0; i < duplicatesToRemove.length; i += chunkSize) {
            const chunk = duplicatesToRemove.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(id => {
              batch.delete(doc(db, 'personnel', id));
            });
            await batch.commit();
          }

          if (updatesToCommit.length > 0) {
            for (let i = 0; i < updatesToCommit.length; i += chunkSize) {
              const chunk = updatesToCommit.slice(i, i + chunkSize);
              const batch = writeBatch(db);
              chunk.forEach(item => {
                batch.update(doc(db, 'personnel', item.primaryId), item.data);
              });
              await batch.commit();
            }
          }

          alert(`🎉 ดำเนินการคัดกรองและปรับปรุงข้อมูลสำเร็จ ลบรายการซ้ำส่วนเกินเรียบร้อยแล้ว (${duplicatesToRemove.length} รายการ)`);
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการคัดกรองลบข้อมูลซ้ำ: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  // Clean / delete corrupted personnel (e.g. from previous imports that turned Thai into mojibake or U+FFFD)
  const handleCleanCorruptedPersonnel = () => {
    if (corruptedPersonnel.length === 0) {
      alert('✨ ระบบตรวจสอบแล้ว ไม่พบข้อมูลบุคลากรที่มีอักขระเพี้ยนหรือเครื่องหมาย  ในฐานข้อมูลค่ะ');
      return;
    }

    const sample = corruptedPersonnel.slice(0, 3).map(p => `${p.id} (${p.name})`).join(', ');
    requestConfirmation(
      'ล้างข้อมูลบุคลากรที่มีอักขระเพี้ยน (ภาษาต่างดาว)',
      `ตรวจพบข้อมูลบุคลากรที่มีอักขระเพี้ยน / สัญลักษณ์  จำนวน ${corruptedPersonnel.length} รายการ (เช่น ${sample} ...)\n\nต้องการลบรายการที่เสียหายเหล่านี้ออกจากฐานข้อมูลเพื่อเตรียมนำเข้าไฟล์ใหม่ที่ถูกต้องใช่หรือไม่?`,
      async () => {
        try {
          const chunkSize = 300;
          for (let i = 0; i < corruptedPersonnel.length; i += chunkSize) {
            const chunk = corruptedPersonnel.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(item => {
              batch.delete(doc(db, 'personnel', item.id));
            });
            await batch.commit();
          }
          alert(`✅ ดำเนินการลบข้อมูลบุคลากรที่อักขระเพี้ยนเรียบร้อยแล้ว (${corruptedPersonnel.length} รายการ)\nตอนนี้ท่านสามารถนำเข้าไฟล์ CSV ใหม่อย่างถูกต้องได้ทันทีค่ะ`);
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการลบข้อมูลที่เพี้ยน: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  // Clear all personnel to allow 100% clean fresh import
  const handleClearAllPersonnel = () => {
    if (personnel.length === 0) {
      alert('ฐานข้อมูลบุคลากรว่างเปล่าอยู่แล้วค่ะ');
      return;
    }
    requestConfirmation(
      '⚠️ ล้างข้อมูลบุคลากรทั้งหมดในฐานข้อมูล',
      `คำเตือน: คุณต้องการลบข้อมูลบุคลากรทั้งหมดจำนวน ${personnel.length} คนออกจากฐานข้อมูลเพื่อเตรียมนำเข้าไฟล์ใหม่ที่ถูกต้องใช่หรือไม่?\n\n(ข้อมูลการเปิดหลักสูตรและประวัติการลงทะเบียนจะไม่ได้รับผลกระทบ)`,
      async () => {
        try {
          const chunkSize = 300;
          for (let i = 0; i < personnel.length; i += chunkSize) {
            const chunk = personnel.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(item => {
              batch.delete(doc(db, 'personnel', item.id));
            });
            await batch.commit();
          }
          alert(`✅ ล้างข้อมูลบุคลากรทั้งหมดเรียบร้อยแล้ว (${personnel.length} รายการ) สามารถนำเข้าไฟล์ CSV ใหม่อย่างสะอาดได้เลยค่ะ`);
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการล้างข้อมูล: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  // Handle CSV parser input import
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
  };

  const processCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const buffer = evt.target?.result as ArrayBuffer;
      if (!buffer) return;
      try {
        const { text, encoding } = decodeCsvBuffer(buffer, csvEncoding);
        const parsed = parsePersonnelCSV(text);
        if (parsed.length === 0) {
          setImportReport('❌ ไม่สามารถแยกวิเคราะห์แถวข้อมูลได้ กรุณาตรึงหัวคอลัมน์ [รหัสบุคลากร, ชื่อ, แผนก, อีเมล]');
          return;
        }

        // Deduplicate incoming CSV records locally first
        const incomingMap = new Map<string, typeof parsed[0]>();

        for (const item of parsed) {
          const normId = item.id.trim().toLowerCase();
          const normEmail = item.email.trim().toLowerCase();

          // A person is identified primarily by their unique personnel ID
          const itemKey = normId ? `id:${normId}` : (normEmail ? `email:${normEmail}` : '');
          if (!itemKey) continue;

          if (incomingMap.has(itemKey)) {
            const prev = incomingMap.get(itemKey)!;
            // The later row in the CSV file represents the latest record.
            // Crucial: ALWAYS update position to the latest row's position!
            incomingMap.set(itemKey, {
              id: item.id || prev.id,
              name: item.name || prev.name,
              position: (item.position && item.position.trim() !== '') ? item.position.trim() : prev.position,
              curriculum: (item.curriculum && item.curriculum !== '-') ? item.curriculum : prev.curriculum,
              academicDepartment: (item.academicDepartment && item.academicDepartment !== '-') ? item.academicDepartment : prev.academicDepartment,
              department: (item.department && item.department !== 'ทั่วไป') ? item.department : prev.department,
              email: item.email || prev.email,
              phone: (item.phone && item.phone !== '-') ? item.phone : prev.phone,
            });
          } else {
            incomingMap.set(itemKey, item);
          }
        }

        const uniqueIncoming = Array.from(incomingMap.values());

        let newCount = 0;
        let updateCount = 0;
        let unchangedCount = 0;

        const chunkSize = 300;
        for (let i = 0; i < uniqueIncoming.length; i += chunkSize) {
          const chunk = uniqueIncoming.slice(i, i + chunkSize);
          const batch = writeBatch(db);

          chunk.forEach(item => {
            const normId = item.id.trim().toLowerCase();
            const normEmail = item.email.trim().toLowerCase();

            // Match existing record primarily by Personnel ID to prevent merging colleagues who share an email
            const existing = personnel.find(p => {
              const pId = p.id ? p.id.trim().toLowerCase() : '';
              const pEmail = p.email ? p.email.trim().toLowerCase() : '';
              if (normId && pId) {
                return pId === normId;
              }
              if (!normId && normEmail && pEmail) {
                return pEmail === normEmail;
              }
              return false;
            });

            // Canonical target ID from new CSV row
            const targetId = (item.id.trim() || (existing ? existing.id : '')).slice(0, 120);
            if (!targetId) return;

            // Prevent corrupted existing records from contaminating clean newly imported CSV rows
            const cleanExistingName = (existing?.name && !existing.name.includes('\uFFFD')) ? existing.name : '';
            const cleanExistingDept = (existing?.department && !existing.department.includes('\uFFFD')) ? existing.department : 'ทั่วไป';
            const cleanExistingCurr = (existing?.curriculum && !existing.curriculum.includes('\uFFFD')) ? existing.curriculum : '-';
            const cleanExistingAcadDept = (existing?.academicDepartment && !existing.academicDepartment.includes('\uFFFD')) ? existing.academicDepartment : '-';
            const cleanExistingPos = (existing?.position && !existing.position.includes('\uFFFD')) ? existing.position : '-';

            const updatedDept = ((item.department && item.department !== 'ทั่วไป') ? item.department.trim() : cleanExistingDept).slice(0, 450);
            const rawCurriculum = (item.curriculum && item.curriculum !== '-') ? item.curriculum : cleanExistingCurr;
            const updatedCurriculum = getDisplayCurriculum(rawCurriculum, updatedDept).slice(0, 950);
            const updatedAcadDept = ((item.academicDepartment && item.academicDepartment !== '-') ? item.academicDepartment.trim() : cleanExistingAcadDept).slice(0, 450);
            const updatedName = (item.name.trim() || cleanExistingName || '').slice(0, 280);

            // ตำแหน่ง: ปรับข้อมูลตำแหน่งเป็นไปตามไฟล์ล่าสุดที่จะนำเข้าข้อมูลทุกครั้ง
            // Always set position according to the latest imported CSV file!
            const latestPosFromFile = (item.position && item.position.trim() !== '') ? item.position.trim() : '';
            const updatedPosition = (latestPosFromFile || cleanExistingPos || '-').slice(0, 450);

            const updatedEmail = (item.email.trim().toLowerCase() || existing?.email || '').slice(0, 180);
            const updatedPhone = ((item.phone && item.phone !== '-') ? item.phone.trim() : (existing?.phone || '-')).slice(0, 180);

            if (existing) {
              const isChanged = 
                existing.id !== targetId ||
                existing.name !== updatedName ||
                existing.position !== updatedPosition ||
                existing.curriculum !== updatedCurriculum ||
                existing.academicDepartment !== updatedAcadDept ||
                existing.department !== updatedDept ||
                existing.email !== updatedEmail ||
                existing.phone !== updatedPhone;

              const docRef = doc(db, 'personnel', targetId);

              batch.set(docRef, {
                id: targetId,
                name: updatedName,
                position: updatedPosition,
                curriculum: updatedCurriculum,
                academicDepartment: updatedAcadDept,
                department: updatedDept,
                email: updatedEmail,
                phone: updatedPhone,
                createdAt: existing.createdAt || new Date().toISOString()
              });

              // Delete old document if the ID changed
              if (existing.id && existing.id !== targetId) {
                const oldDocRef = doc(db, 'personnel', existing.id);
                batch.delete(oldDocRef);
              }

              if (isChanged) {
                updateCount++;
              } else {
                unchangedCount++;
              }
            } else {
              const docRef = doc(db, 'personnel', targetId);
              batch.set(docRef, {
                id: targetId,
                name: updatedName,
                position: updatedPosition,
                curriculum: updatedCurriculum,
                academicDepartment: updatedAcadDept,
                department: updatedDept,
                email: updatedEmail,
                phone: updatedPhone,
                createdAt: new Date().toISOString()
              });
              newCount++;
            }
          });

          await batch.commit();
        }

        const encodingDesc = encoding === 'windows-874' ? 'Windows-874 / TIS-620 (Microsoft Excel ภาษาไทย)' : 'UTF-8';
        setImportReport(
          `✅ นำเข้าและประมวลผลข้อมูลสำเร็จ:\n` +
          `• การเข้ารหัสภาษาที่ตรวจพบ: ${encodingDesc}\n` +
          `• เพิ่มบุคลากรใหม่: ${newCount} รายการ\n` +
          `• อัปเดตข้อมูลเดิม/ปรับตำแหน่งล่าสุด: ${updateCount} รายการ\n` +
          (unchangedCount > 0 ? `• ข้อมูลเดิมตรงกันแล้ว: ${unchangedCount} รายการ\n` : '') +
          `• รวมข้อมูลทั้งหมดในไฟล์: ${uniqueIncoming.length} รายการ`
        );
      } catch (err) {
        setImportReport(`❌ เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ${err}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Admin add
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminForm.email || !adminForm.name) return;
    if (!adminForm.email.endsWith('@bu.ac.th')) {
      alert('บัญชีเจ้าหน้าที่แอดมินจำกัดสิทธิ์เฉพาะสังกัด @bu.ac.th');
      return;
    }

    const emailKey = adminForm.email.toLowerCase().trim();
    const data: Admin = {
      email: emailKey,
      name: adminForm.name,
      assignedAt: new Date().toISOString(),
      assignedBy: userEmail,
      role: 'Admin',
      staffId: adminForm.staffId || '',
      position: adminForm.position || '',
      department: adminForm.department || '',
      phone: adminForm.phone || ''
    };

    try {
      await setDoc(doc(db, 'admins', emailKey), data);
      alert('แต่งตั้งแอดมินสำเร็จ 🎉');
      setAdminForm({ email: '', name: '', role: 'Admin', staffId: '', position: '', department: '', phone: '' });
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเพิ่มแอดมิน: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const processAdminCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      try {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          alert('ไม่สามารถแยกวิเคราะห์แถวข้อมูลได้ ไฟล์มีขนาดเล็กเกินไป');
          return;
        }

        const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^["\uFEFF]|["$]/g, '').toLowerCase());
        const emailIdx = rawHeaders.findIndex(h => h.includes('email') || h.includes('อีเมล') || h.includes('เมล'));
        const nameIdx = rawHeaders.findIndex(h => h.includes('name') || h.includes('ชื่อ') || h.includes('นามสกุล'));
        const roleIdx = rawHeaders.findIndex(h => h.includes('role') || h.includes('สิทธิ์') || h.includes('ประเภท') || h.includes('ตำแหน่ง'));
        const staffIdIdx = rawHeaders.findIndex(h => h.includes('staff') || h.includes('id') || h.includes('รหัส'));
        const positionIdx = rawHeaders.findIndex(h => h.includes('position') || h.includes('ตำแหน่งงาน') || h.includes('ตำแหน่ง'));
        const departmentIdx = rawHeaders.findIndex(h => h.includes('dept') || h.includes('department') || h.includes('หน่วยงาน') || h.includes('สังกัด') || h.includes('แผนก'));
        const phoneIdx = rawHeaders.findIndex(h => h.includes('phone') || h.includes('โทรศัพท์') || h.includes('เบอร์'));

        const emailPos = emailIdx !== -1 ? emailIdx : 0;
        const namePos = nameIdx !== -1 ? nameIdx : 1;

        let count = 0;
        let errors: string[] = [];
        const parsedAdmins: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values: string[] = [];
          let insideQuote = false;
          let currentField = '';
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
              values.push(currentField.trim());
              currentField = '';
            } else {
              currentField += char;
            }
          }
          values.push(currentField.trim());

          if (values.length < 2) continue;

          const email = values[emailPos]?.replace(/^["']|["']$/g, '').toLowerCase().trim() || '';
          const name = values[namePos]?.replace(/^["']|["']$/g, '').trim() || '';
          const staffId = staffIdIdx !== -1 ? (values[staffIdIdx]?.replace(/^["']|["']$/g, '').trim() || '') : '';
          const position = positionIdx !== -1 ? (values[positionIdx]?.replace(/^["']|["']$/g, '').trim() || '') : '';
          const department = departmentIdx !== -1 ? (values[departmentIdx]?.replace(/^["']|["']$/g, '').trim() || '') : '';
          const phone = phoneIdx !== -1 ? (values[phoneIdx]?.replace(/^["']|["']$/g, '').trim() || '') : '';

          if (!email || !email.endsWith('@bu.ac.th')) {
            errors.push(`แถวที่ ${i + 1}: อีเมล "${email}" ไม่ถูกต้องหรือไม่ได้ใช้ @bu.ac.th`);
            continue;
          }

          if (!name) {
            errors.push(`แถวที่ ${i + 1}: ไม่พบข้อมูลชื่อพนักงาน`);
            continue;
          }

          const role = 'Admin';
          parsedAdmins.push({
            email,
            name,
            role,
            assignedAt: new Date().toISOString(),
            assignedBy: userEmail,
            staffId,
            position,
            department,
            phone
          });
        }

        if (parsedAdmins.length > 0) {
          const chunkSize = 400;
          for (let i = 0; i < parsedAdmins.length; i += chunkSize) {
            const chunk = parsedAdmins.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(adm => {
              const docRef = doc(db, 'admins', adm.email);
              batch.set(docRef, adm);
              count++;
            });
            await batch.commit();
          }

          let msg = `✅ นำเข้าแอดมินเจ้าหน้าที่ผ่าน CSV สำเร็จ 🌟 จำนวน ${count} บัญชี`;
          if (errors.length > 0) {
            msg += `\n\n⚠️ มีข้อผิดพลาดบางรายการ:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...และอื่นๆ' : ''}`;
          }
          alert(msg);
        } else {
          alert('❌ ไม่พบบัญชีผู้ใช้ที่สอดคล้องตามเงื่อนไขเพื่อนำเข้าในไฟล์ CSV นี้\n' + errors.join('\n'));
        }
      } catch (err) {
        alert(`❌ เกิดข้อผิดพลาดในการนำเข้าแอดมิน: ${err}`);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDeleteAdmin = (email: string) => {
    const isSelf = email.toLowerCase().trim() === userEmail.toLowerCase().trim();
    if (isSelf) {
      alert('⚠️ คุณไม่สามารถถอดถอนสิทธิ์บัญชีผู้ใช้แอดมินของตนเองขณะที่เข้าใช้งานระบบอยู่ เพื่อป้องกันไม่ให้สูญเสียสิทธิ์ในการจัดการฐานข้อมูล');
      return;
    }

    requestConfirmation(
      'ยืนยันถอดถอนสิทธิ์แอดมิน',
      `คุณแน่ใจหรือไม่ที่จะลบและถอดถอนสิทธิ์ผู้ดูแลระบบของอีเมล "${email}" รายชื่อประวัติการจัดการข้อมูลของพนักงานคนนี้จะถูกเพิกถอนสิทธิ์เข้าสู่ระบบทันที?`,
      async () => {
        try {
          await deleteDoc(doc(db, 'admins', email));
          alert('ถอดถอนสิทธิ์แอดมินสำเร็จเรียบร้อย 🎉');
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการลบสิทธิ์: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  // Bulk Email Dispatcher
  const handleSendBulkEmail = async () => {
    if (!selectedCourseForEmail || !bulkEmailMessage.trim()) return;
    
    // Find all registered email lists
    const matchedRegs = registrations.filter(r => r.courseId === selectedCourseForEmail.id);
    const emails = matchedRegs.map(r => r.email);

    if (emails.length === 0) {
      alert('ไม่สามารถส่งประกาศได้เนื่องจากยังไม่มีผู้ร่วมโครงการลงทะเบียนสำหรับกิจกรรมการอบรมนี้');
      return;
    }

    setSendingBulkEmail(true);

    const isGroupTo = bulkSendType === 'group_to';
    const isGroupBcc = bulkSendType === 'group_bcc';
    const ccEmail = bulkCcAdmin ? (bulkCcEmails.length > 0 ? bulkCcEmails.join(",") : (userEmail || 'buqa@bu.ac.th')) : undefined;
    const subject = `📣 ข่าวสาร/เอกสารส่งต่อสำคัญจากหลักสูตร: ${selectedCourseForEmail.title}`;

    let payload;

    if (isGroupTo || isGroupBcc) {
      const formattedMsgHtml = bulkEmailMessage.replace(/\n/g, '<br/>');
      const emailHtmlBody = `
        <div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
          <div style='text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%); padding: 20px; border-radius: 8px; color: #ffffff;'>
            <h3 style='margin: 0; font-size: 17px; font-weight: 800;'>ระบบบริหารจัดการการอบรม</h3>
            <p style='margin: 5px 0 0 0; font-size: 11px; opacity: 0.9;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
          </div>
          
          <div style='font-size: 14px; color: #475569; line-height: 1.6;'>
            <h4 style='color: #4f46e5; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; font-weight: 800;'>${selectedCourseForEmail.title}</h4>
            <p style='font-size: 14px; color: #334155;'>เรียน อาจารย์ทุกท่าน,</p>
            <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ผู้ดำเนินการจัดโครงการอบรมหลักสูตรดังกล่าว ได้ทำการส่งข้อมูลเอกสารประกอบการศึกษาและไฟล์มีเดียประกอบสัมมนาสำหรับคุณ ดังรายละเอียดความข้างล่างนี้:</p>
            <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #334155; border: 1px solid #f1f5f9; white-space: pre-wrap; line-height: 1.6;'>${formattedMsgHtml}</div>
            <p style='font-size: 14px; color: #334155;'>ขอแสดงความนับถืออย่างสูง,<br/><strong style='color: #4f46e5;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</strong></p>
          </div>
          
          <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
          <div style='text-align: center;'>
            <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลแจ้งเตือนอัตโนมัติจากระบบบริการบุคลากร มหาวิทยาลัยกรุงเทพ</p>
          </div>
        </div>
      `;

      payload = {
        action: 'campaign_invitation',
        email: isGroupTo ? emails.join(",") : (userEmail || 'buqa@bu.ac.th'),
        ...(isGroupTo ? {} : { bccEmails: emails }),
        ccEmail: ccEmail,
        subject: subject,
        messageText: bulkEmailMessage,
        htmlBody: emailHtmlBody
      };
    } else {
      payload = {
        action: 'bulk',
        emails: emails,
        courseTitle: selectedCourseForEmail.title,
        messageText: bulkEmailMessage,
        ccEmail: ccEmail
      };
    }

    try {
      let actualSuccess = emails.length;
      let actualFailed = 0;
      let failedList: string[] = [];

      if (gasUrl) {
        const gasRes = await sendGasWebhook(gasUrl, payload);
        if (typeof gasRes.count === 'number') {
          actualSuccess = gasRes.count;
        } else if (gasRes.failedCount) {
          actualSuccess = Math.max(0, emails.length - gasRes.failedCount);
        }
        actualFailed = gasRes.failedCount || 0;
        failedList = gasRes.failedEmails || [];

        if (actualFailed > 0) {
          alert(`⚠️ ผลการส่งรายงานสรุปทางอีเมล (Bulk):\n• ส่งสำเร็จ: ${actualSuccess} คน\n• ส่งล้มเหลว: ${actualFailed} คน\n${failedList.length ? `รายชื่อเมลที่ขัดข้อง: ${failedList.join(', ')}\n` : ''}โปรดตรวจสอบโควต้าอีเมลของบัญชีผู้ส่งค่ะ`);
        } else {
          alert(`🎉 สั่งการส่งรายงานสรุปทางอีเมลไปยังบุคลากรทั้งหมดจำนวน ${actualSuccess} คน สำเร็จเรียบร้อยแล้วค่ะ!`);
        }
      } else {
        // Mock simulation
        console.warn('--- EMAIL BULK SIMULATION (No GAS) ---');
        console.warn(`Sent to ${emails.length} participants of "${selectedCourseForEmail.title}":`, bulkEmailMessage);
        alert(`[แอดมินจำลอง] ส่งเมลกลุ่มสำเร็จ สื่อสารไปยังบุคลากร ${emails.length} ฉบับ (แสดงผลลัพธ์ในบอร์ดคอนโซลแล้ว)`);
      }
      // Log bulk announcement to campaign history
      const bulkLog: CampaignLog = {
        id: `bulk_announce_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        courseId: selectedCourseForEmail.id,
        courseTitle: selectedCourseForEmail.title,
        subject: subject,
        message: bulkEmailMessage,
        targetType: 'specific_personnel',
        targetDetails: `ผู้ลงทะเบียนหลักสูตร ${selectedCourseForEmail.title} (${emails.length} คน)`,
        recipientsCount: emails.length,
        successCount: actualSuccess,
        failCount: actualFailed,
        sentAt: new Date().toISOString(),
        sentBy: userEmail || 'buqa@bu.ac.th',
        recipientEmails: emails,
        recipientIds: matchedRegs.map(r => r.personnelId || r.id),
        recipientsSnapshot: matchedRegs.map(r => ({
          id: r.personnelId || r.id,
          name: r.name,
          email: r.email,
          position: r.position || '',
          department: r.department || ''
        })),
        logs: emails.map(e => `[${new Date().toLocaleTimeString('th-TH')}] ข่าวสารไปยัง ${e}`),
        sendType: isGroupTo ? 'group_to' : 'individual'
      };
      await saveCampaignLog(bulkLog);

      setShowBulkEmailModal(false);
      setBulkEmailMessage('');
    } catch (err) {
      console.error(err);
      alert('❌ ระบบจัดส่งล้มเหลว:\n' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSendingBulkEmail(false);
    }
  };

  // Helper to segment and filter recipients for campaigns
  const getCampaignRecipients = () => {
    return campaignCustomRecipients;
  };

  // Format text for email HTML rendering (preserves manual line breaks faithfully, handles no-break spans and zero-width spaces)
  const formatMessageForHtml = (msg: string): string => {
    if (!msg) return '';
    return msg
      .replace(/\[nobr\]([\s\S]*?)\[\/nobr\]/g, '<span style="white-space: nowrap; word-break: keep-all; display: inline-block;">$1</span>')
      .replace(/\r\n/g, '\n')
      .replace(/\n/g, '<br/>');
  };



  // Template custom render placeholder substitution
  const renderTemplate = (text: string, person: Personnel | null, selectedCourse: Course | null, isGroup?: boolean) => {
    if (!text) return '';
    let result = text;
    
    const isGroupMode = isGroup !== undefined ? isGroup : (person?.id === 'all');

    if (isGroupMode) {
      // If sending to everyone (to ทุกคน / group_to / group_bcc), greeting must be "เรียน อาจารย์ทุกท่าน"
      result = result
        .replace(/เรียน\s*อาจารย์\s*(\{name\}|\{recipient_name\}|บุคลากรทุกท่าน|ผู้ร่วมอบรมทุกท่าน)/gi, 'เรียน อาจารย์ทุกท่าน')
        .replace(/เรียน\s*(\{name\}|\{recipient_name\})/gi, 'เรียน อาจารย์ทุกท่าน')
        .replace(/เรียน\s*อาจารย์\s*และ\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน')
        .replace(/เรียน\s*อาจารย์\s*\/\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน')
        .replace(/เรียน\s*อาจารย์\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน')
        .replace(/เรียน\s*บุคลากรทุกท่าน/gi, 'เรียน อาจารย์ทุกท่าน');
    }
    
    // Fallback variables represent high-quality design defaults
    const nameVal = isGroupMode 
      ? 'ทุกท่าน' 
      : (person ? person.name : 'คุณวิภาดา แดนอุดม (เจ้าหน้าที่พัฒนาบุคลากร)');
    const idVal = person ? person.id : '10901234';
    const deptVal = person ? person.department : 'คณะเทคโนโลยีสารสนเทศและนวัตกรรม';
    const titleVal = selectedCourse ? selectedCourse.title : 'การประยุกต์ใช้ AI ในการวิเคราะห์คุณภาพวิทยานิพนธ์ระดับสากล';
    const speakerVal = selectedCourse ? selectedCourse.speaker : 'รศ.ดร.สมชาย ใจดีเจริญ';
    const dateTimeVal = selectedCourse ? `${selectedCourse.date} เวลา ${selectedCourse.time} น.` : '15 มิถุนายน 2026 เวลา 09:00 - 12:00 น.';
    const locationVal = selectedCourse ? selectedCourse.location : 'ห้องสัมมนาใหญ่ ชั้น 4 อาคาร C4 วิทยาเขตรังสิต';
    const registerLinkVal = selectedCourse 
      ? `${getCleanOrigin()}/?courseId=${selectedCourse.id}`
      : `${getCleanOrigin()}/?courseId=sample_id_preview`;

    const posterUrlVal = selectedCourse ? (selectedCourse.posterUrl || '') : '';
    let posterHtmlVal = '';
    if (posterUrlVal) {
      posterHtmlVal = `<div style="text-align: center; margin: 12px 0;"><img src="${posterUrlVal}" alt="${titleVal}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" /></div>`;
    }

    result = result.replace(/{name}/g, nameVal)
                   .replace(/{recipient_name}/g, nameVal)
                   .replace(/{id}/g, idVal)
                   .replace(/{department}/g, deptVal)
                   .replace(/{course_title}/g, titleVal)
                   .replace(/{speaker}/g, speakerVal)
                   .replace(/{date_time}/g, dateTimeVal)
                   .replace(/{location}/g, locationVal)
                   .replace(/{register_link}/g, registerLinkVal)
                   .replace(/{course_poster_url}/g, posterUrlVal)
                   .replace(/{course_poster_html}/g, posterHtmlVal)
                   .replace(/{course_poster}/g, posterHtmlVal);
    return result;
  };

  // Resolver to accurately reconstruct the personnel recipients list from any campaign log
  const resolveRecipientsFromLog = (log: CampaignLog): Personnel[] => {
    const resolved: Personnel[] = [];
    const seenEmails = new Set<string>();
    const seenIds = new Set<string>();

    const addPerson = (p: Personnel) => {
      const emailLower = (p.email || '').toLowerCase().trim();
      if (emailLower && seenEmails.has(emailLower)) return;
      if (p.id && seenIds.has(p.id)) return;
      if (emailLower) seenEmails.add(emailLower);
      if (p.id) seenIds.add(p.id);
      resolved.push(p);
    };

    // 1. If recipientsSnapshot exists (fastest, lossless, and exact)
    if (log.recipientsSnapshot && Array.isArray(log.recipientsSnapshot) && log.recipientsSnapshot.length > 0) {
      log.recipientsSnapshot.forEach(item => {
        const found = personnel.find(p => 
          (item.id && p.id === item.id) || 
          (item.email && p.email && p.email.toLowerCase() === item.email.toLowerCase())
        );
        if (found) {
          addPerson(found);
        } else {
          addPerson({
            id: item.id || `ext_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: item.name || item.email,
            email: item.email,
            position: item.position || 'อาจารย์',
            department: item.department || 'มหาวิทยาลัยกรุงเทพ',
            phone: '',
            createdAt: ''
          });
        }
      });
      if (resolved.length > 0) return resolved;
    }

    // 2. By recipientEmails or recipientIds
    const logEmails = (log.recipientEmails || []).map(e => e.toLowerCase().trim()).filter(Boolean);
    const logIds = (log.recipientIds || []).filter(Boolean);

    // Also extract emails from detailed logs if recipientEmails is empty
    if (logEmails.length === 0 && log.logs && Array.isArray(log.logs)) {
      const emailRegex = /[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
      log.logs.forEach(line => {
        const matches = line.match(emailRegex);
        if (matches) {
          matches.forEach(e => {
            const em = e.toLowerCase().trim();
            if (!logEmails.includes(em)) logEmails.push(em);
          });
        }
      });
    }

    if (logEmails.length > 0 || logIds.length > 0) {
      // Find in existing personnel
      personnel.forEach(p => {
        const pEmail = (p.email || '').toLowerCase().trim();
        if ((pEmail && logEmails.includes(pEmail)) || (p.id && logIds.includes(p.id))) {
          addPerson(p);
        }
      });

      // If some emails in logEmails were not in personnel directory, synthesize personnel items so they are preserved
      logEmails.forEach(email => {
        if (!seenEmails.has(email)) {
          addPerson({
            id: `email_${email}`,
            name: email.split('@')[0],
            email: email,
            position: 'อาจารย์ / บุคลากร',
            department: 'มหาวิทยาลัยกรุงเทพ',
            phone: '',
            createdAt: ''
          });
        }
      });

      if (resolved.length > 0) return resolved;
    }

    // 3. By Position if targetPositions or position clues exist
    const targetDetails = log.targetDetails || '';
    const hasPositionClues = 
      log.targetType === 'position' ||
      targetDetails.includes('ประเภท/ตำแหน่ง') ||
      targetDetails.includes('ตำแหน่ง') ||
      PREDEFINED_POSITIONS.some(pos => targetDetails.includes(pos));

    if (hasPositionClues) {
      let positionsToUse: string[] = [];
      if (log.targetPositions && Array.isArray(log.targetPositions) && log.targetPositions.length > 0) {
        positionsToUse = [...log.targetPositions];
      } else {
        const cleaned = targetDetails.replace(/^(ประเภท\/ตำแหน่ง|ประเภท|ตำแหน่ง|Position)[\s:]*/i, '').trim();
        const splitPositions = cleaned.split(/[,、|]/).map(s => s.trim()).filter(Boolean);
        const matchedPredefined = PREDEFINED_POSITIONS.filter(pos => 
          targetDetails.includes(pos) || splitPositions.some(sp => sp.includes(pos) || pos.includes(sp))
        );
        positionsToUse = matchedPredefined.length > 0 ? matchedPredefined : splitPositions;
      }
      if (positionsToUse.length > 0) {
        personnel.forEach(p => {
          if (positionsToUse.some(pos => matchPosition(p.position || '', pos))) {
            addPerson(p);
          }
        });
        if (resolved.length > 0) return resolved;
      }
    }

    // 4. By Department if targetDepts or department clues exist
    const hasDeptClues = 
      log.targetType === 'custom_dept' ||
      targetDetails.includes('หน่วยงาน/สังกัด') ||
      targetDetails.includes('สังกัด') ||
      targetDetails.includes('หน่วยงาน');

    if (hasDeptClues) {
      let deptsToUse: string[] = [];
      if (log.targetDepts && Array.isArray(log.targetDepts) && log.targetDepts.length > 0) {
        deptsToUse = [...log.targetDepts];
      } else {
        const cleaned = targetDetails.replace(/^(หน่วยงาน\/สังกัด|หน่วยงาน|สังกัด|Department)[\s:]*/i, '').trim();
        const splitDepts = cleaned.split(/[,、|]/).map(s => s.trim()).filter(Boolean);
        const allAvailableDepts: string[] = Array.from(new Set(personnel.map(p => p.department).filter((d): d is string => Boolean(d))));
        deptsToUse = allAvailableDepts.filter(dept => 
          targetDetails.includes(dept) || splitDepts.some(sd => sd.includes(dept) || dept.includes(sd))
        );
      }
      if (deptsToUse.length > 0) {
        personnel.forEach(p => {
          if (deptsToUse.includes(p.department)) {
            addPerson(p);
          }
        });
        if (resolved.length > 0) return resolved;
      }
    }

    // 5. If all personnel
    if (log.targetType === 'all' || targetDetails.includes('บุคลากรทั้งหมด')) {
      personnel.forEach(p => addPerson(p));
      return resolved;
    }

    return resolved;
  };

  const handleReuseCampaignTargetGroup = (log: CampaignLog) => {
    isReusingTargetGroupRef.current = true;
    const resolvedRecipients = resolveRecipientsFromLog(log);

    if (resolvedRecipients.length === 0) {
      alert(`⚠️ ไม่พบรายชื่อผู้รับในประวัติการส่งนี้ (${log.targetDetails || 'ไม่ระบุกลุ่ม'}) ค่ะ`);
      return;
    }

    // Set recipients
    setCampaignCustomRecipients(resolvedRecipients);

    const targetDetails = log.targetDetails || '';
    const hasPositionClues = 
      log.targetType === 'position' ||
      targetDetails.includes('ประเภท/ตำแหน่ง') ||
      targetDetails.includes('ตำแหน่ง') ||
      PREDEFINED_POSITIONS.some(pos => targetDetails.includes(pos));

    const hasDeptClues = 
      log.targetType === 'custom_dept' ||
      targetDetails.includes('หน่วยงาน/สังกัด') ||
      targetDetails.includes('สังกัด') ||
      targetDetails.includes('หน่วยงาน');

    if (hasPositionClues && !hasDeptClues && log.targetPositions && log.targetPositions.length > 0) {
      setCampaignTargetType('position');
      setCampaignPositions([...log.targetPositions]);
      setLastFilters({
        targetType: 'position',
        depts: [...campaignDepts],
        positions: [...log.targetPositions]
      });
    } else if (hasDeptClues && !hasPositionClues && log.targetDepts && log.targetDepts.length > 0) {
      setCampaignTargetType('custom_dept');
      setCampaignDepts([...log.targetDepts]);
      setLastFilters({
        targetType: 'custom_dept',
        depts: [...log.targetDepts],
        positions: [...campaignPositions]
      });
    } else if (log.targetType === 'all') {
      setCampaignTargetType('all');
      setLastFilters({
        targetType: 'all',
        depts: [...campaignDepts],
        positions: [...campaignPositions]
      });
    } else {
      // Specific personnel / custom group
      setCampaignTargetType('specific_personnel');
      setLastFilters({
        targetType: 'specific_personnel',
        depts: [...campaignDepts],
        positions: [...campaignPositions]
      });
    }

    // Switch to tab
    setActiveTab('invitations');
    
    // Notification banner
    const groupName = log.targetDetails || 'กลุ่มที่เลือก';
    setCampaignReuseNotification({
      title: `ดึงรายชื่อกลุ่มเป้าหมายเดิมสำเร็จ (${resolvedRecipients.length} คน)`,
      message: `ดึงรายชื่อผู้รับจาก "${log.courseTitle || log.subject}" [${groupName}] จำนวน ${resolvedRecipients.length} คน เรียบร้อยแล้วค่ะ 🎯 คุณสามารถเลือกหลักสูตรการอบรมสำหรับการส่งครั้งต่อไป หรือคลิก "ดูรายชื่อ" เพื่อตรวจสอบ/ปรับเปลี่ยนได้ทันที`,
      count: resolvedRecipients.length
    });

    // Scroll smoothly to form
    setTimeout(() => {
      const campaignFormElement = document.getElementById('email-campaign-form');
      if (campaignFormElement) {
        campaignFormElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  // Helper to extract failed/skipped recipients from a campaign log (supports new logs and legacy logs)
  const getFailedRecipientsFromLog = (log: CampaignLog): CampaignRecipientSnapshot[] => {
    if (log.failedRecipients && Array.isArray(log.failedRecipients) && log.failedRecipients.length > 0) {
      return log.failedRecipients;
    }
    
    // Dynamic fallback for historical logs (like when 72 out of 73 succeeded)
    const failedList: CampaignRecipientSnapshot[] = [];
    const validEmails = new Set((log.recipientEmails || []).map(e => e.toLowerCase().trim()).filter(Boolean));
    
    if (log.recipientsSnapshot && Array.isArray(log.recipientsSnapshot) && log.recipientsSnapshot.length > 0) {
      log.recipientsSnapshot.forEach(r => {
        const email = (r.email || '').toLowerCase().trim();
        if (!email || !email.includes('@')) {
          failedList.push({
            id: r.id,
            name: r.name,
            email: r.email || '',
            position: r.position || '',
            department: r.department || '',
            reason: 'ไม่มีที่อยู่อีเมลในระบบ'
          });
        } else if (validEmails.size > 0 && !validEmails.has(email) && log.successCount < log.recipientsCount) {
          failedList.push({
            id: r.id,
            name: r.name,
            email: r.email,
            position: r.position || '',
            department: r.department || '',
            reason: 'ระบบข้ามหรือจัดส่งไม่สำเร็จ'
          });
        }
      });
    }

    // If snapshot didn't capture failure, look for error logs
    if (failedList.length === 0 && log.logs && Array.isArray(log.logs)) {
      log.logs.forEach(line => {
        if (line.includes('❌') || line.includes('ข้าม') || line.includes('ล้มเหลว') || line.includes('ไม่มีที่อยู่อีเมล')) {
          const nameMatch = line.match(/(?:ไปยังคุณ|คุณ)\s*([^\s(]+(?:\s+[^\s(]+)?)/);
          const name = nameMatch ? nameMatch[1].trim() : 'ผู้รับที่พบข้อผิดพลาด';
          failedList.push({
            id: `fail_log_${Math.random().toString(36).substr(2, 6)}`,
            name: name,
            email: '',
            position: 'อาจารย์ / บุคลากร',
            department: 'มหาวิทยาลัยกรุงเทพ',
            reason: line
          });
        }
      });
    }

    return failedList;
  };

  // Handler to retry sending only to failed/skipped recipients
  const handleRetryFailedRecipients = (log: CampaignLog) => {
    const failedList = getFailedRecipientsFromLog(log);
    if (failedList.length === 0) {
      alert('ไม่พบรายชื่อผู้รับที่จัดส่งไม่สำเร็จในประวัตินี้ค่ะ (สำเร็จครบ 100%)');
      return;
    }

    const resolvedFailed: Personnel[] = failedList.map(item => {
      const existing = personnel.find(p => p.id === item.id || (p.email && item.email && p.email.toLowerCase() === item.email.toLowerCase()));
      if (existing) return existing;
      return {
        id: item.id || `fail_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: item.name || 'ไม่ระบุชื่อ',
        email: item.email || '',
        position: item.position || 'อาจารย์',
        department: item.department || 'มหาวิทยาลัยกรุงเทพ',
        phone: '',
        createdAt: ''
      };
    });

    isReusingTargetGroupRef.current = true;
    setCampaignCustomRecipients(resolvedFailed);
    setCampaignTargetType('specific_personnel');
    if (log.courseId) {
      setCampaignCourseId(log.courseId);
    }
    if (log.subject) {
      setCampaignSubject(log.subject);
    }
    if (log.message) {
      setCampaignMessage(log.message);
    }
    if (log.sendType) {
      setCampaignSendType(log.sendType);
    }

    setActiveTab('invitations');
    setCampaignReuseNotification({
      title: `ดึงรายชื่อผู้ที่ยังไม่ได้รับอีเมล (${resolvedFailed.length} คน)`,
      message: `ระบบโหลดรายชื่อเฉพาะผู้ที่จัดส่งไม่สำเร็จหรือไม่มีอีเมลจากรอบ "${log.courseTitle || log.subject}" จำนวน ${resolvedFailed.length} ท่านเรียบร้อยแล้วค่ะ ท่านสามารถตรวจสอบและกรอกอีเมลเพิ่มเติม จากนั้นกดส่งใหม่ได้ทันทีค่ะ 🎯`,
      count: resolvedFailed.length
    });

    setTimeout(() => {
      const campaignFormElement = document.getElementById('email-campaign-form');
      if (campaignFormElement) {
        campaignFormElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
  };

  // Toggle archive status of a campaign log
  const handleToggleArchiveCampaignLog = async (log: CampaignLog) => {
    try {
      const isArchiving = !log.archived;
      const updatedLog = cleanForFirestore({
        ...log,
        archived: isArchiving
      });
      await setDoc(doc(db, 'campaign_logs', log.id), updatedLog);
      alert(isArchiving ? 'จัดเก็บประวัติการส่งสำเร็จ 📁' : 'ยกเลิกการจัดเก็บประวัติการส่งสำเร็จ 🔓');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Delete a campaign log with confirmation
  const handleDeleteCampaignLog = async (logId: string) => {
    requestConfirmation(
      'ยืนยันลบประวัติการส่งจดหมายเชิญ',
      'คุณแน่ใจหรือไม่ที่จะลบประวัติการส่งจดหมายเชิญนี้ออกจากระบบอย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้',
      async () => {
        try {
          await deleteDoc(doc(db, 'campaign_logs', logId));
          alert('ลบประวัติการส่งจดหมายเชิญออกจากระบบสำเร็จ 🗑️');
        } catch (err) {
          console.error(err);
          alert('เกิดข้อผิดพลาดในการลบ: ' + (err instanceof Error ? err.message : String(err)));
        }
      }
    );
  };

  // Start editing a campaign log
  const handleStartEditCampaignLog = (log: CampaignLog) => {
    setEditingCampaignLog(log);
    setEditCampaignForm({
      ...log
    });
  };

  // Save changes to edited campaign log
  const handleSaveCampaignLogEdit = async () => {
    if (!editingCampaignLog) return;
    if (!editCampaignForm.subject || !editCampaignForm.message || !editCampaignForm.courseTitle) {
      alert('กรุณากรอกข้อมูลหลักสูตร หัวข้ออีเมล และเนื้อหาอีเมลให้ครบถ้วน');
      return;
    }
    try {
      const updatedLog: CampaignLog = cleanForFirestore({
        ...editingCampaignLog,
        courseTitle: editCampaignForm.courseTitle || '',
        courseId: editCampaignForm.courseId || '',
        subject: editCampaignForm.subject || '',
        message: editCampaignForm.message || '',
        targetDetails: editCampaignForm.targetDetails || '',
        recipientsCount: Number(editCampaignForm.recipientsCount) || 0,
        successCount: Number(editCampaignForm.successCount) || 0,
        failCount: Number(editCampaignForm.failCount) || 0,
        sentBy: editCampaignForm.sentBy || '',
        sentAt: editCampaignForm.sentAt || new Date().toISOString()
      });
      await setDoc(doc(db, 'campaign_logs', editingCampaignLog.id), updatedLog);
      alert('แก้ไขประวัติการจัดส่งเรียบร้อยแล้วค่ะ 🎉');
      setEditingCampaignLog(null);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Create a manual campaign log
  const handleManualAddCampaignLog = async () => {
    if (!addCampaignForm.courseTitle || !addCampaignForm.subject || !addCampaignForm.message) {
      alert('กรุณากรอกข้อมูลหลักสูตรอบรม หัวข้ออีเมล และเนื้อความอีเมลให้ครบถ้วน');
      return;
    }
    try {
      const campaignLogId = `manual_log_${Date.now()}`;
      const newCampaignLog: CampaignLog = cleanForFirestore({
        id: campaignLogId,
        courseId: addCampaignForm.courseId || 'manual',
        courseTitle: addCampaignForm.courseTitle || '',
        subject: addCampaignForm.subject || '',
        message: addCampaignForm.message || '',
        targetType: addCampaignForm.targetType || 'all',
        targetDetails: addCampaignForm.targetDetails || 'ลงบันทึกเองแบบแมนนวล',
        recipientsCount: Number(addCampaignForm.recipientsCount) || 0,
        successCount: Number(addCampaignForm.successCount) || 0,
        failCount: Number(addCampaignForm.failCount) || 0,
        sentAt: addCampaignForm.sentAt || new Date().toISOString(),
        sentBy: addCampaignForm.sentBy || userEmail || 'admin@bu.ac.th',
        archived: false,
        logs: [
          `[ลงบันทึกแมนนวล] โดย ${userEmail || 'แอดมิน'}`,
          `จำนวนเป้าหมายที่ลงบันทึก: ${addCampaignForm.recipientsCount || 0} รายการ (สำเร็จ ${addCampaignForm.successCount || 0}, ล้มเหลว ${addCampaignForm.failCount || 0})`
        ]
      });
      await setDoc(doc(db, 'campaign_logs', campaignLogId), newCampaignLog);
      alert('เพิ่มประวัติการส่งจดหมายเชิญแบบกำหนดเอง (Manual) สำเร็จ 🎉');
      setShowAddCampaignModal(false);
      // Reset form
      setAddCampaignForm({
        courseId: '', courseTitle: '', subject: '', message: '', targetType: 'all',
        targetDetails: '', recipientsCount: 0, successCount: 0, failCount: 0, sentAt: '', sentBy: '', logs: []
      });
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเพิ่มประวัติ: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Dispatch campaign email to segment targets
  const handleSendCampaignEmails = async () => {
    const recipients = getCampaignRecipients();
    const selectedCourse = courses.find(c => c.id === campaignCourseId);
    if (!selectedCourse) {
      alert('กรุณาเลือกหลักสูตรเป้าหมายที่ต้องการส่งสารเชลอบรมในครั้งนี้ค่ะ');
      return;
    }
    if (recipients.length === 0) {
      alert('ไม่พบรายชื่อบุคลากรที่มีข้อมูลขัดแย้งตามประเภทที่คัดเลือก กรุณาตรวจสอบสังกัดและอัปโหลดรายชื่อบุคลากรก่อนทำการส่งค่ะ');
      return;
    }

    requestConfirmation(
      'เปิดใช้งานแคมเปญส่งเมลจดหมายเชิญ',
      `คุณแน่ใจหรือไม่ที่จะเปิดใช้งานแคมเปญส่งเมลจดหมายเชิญเข้าอบรมหัวข้อ "${selectedCourse.title}" ไปยังกลุ่มเป้าหมายบุคลากรทั้งหมดจำนวน ${recipients.length} คน ผ่านระบบเครือข่ายของมหาวิทยาลัย?`,
      async () => {
        setSendingCampaignMessage(true);
        setCampaignProgress({ total: recipients.length, sent: 0, logs: [] });
        setShowCampaignLogs(true);
        
        let sentCount = 0;
        let successCount = 0;
        let failCount = 0;
        const progressLogs: string[] = [];
        const validRecipients = recipients.filter(r => r.email && r.email.trim().includes('@'));
        const invalidRecipients = recipients.filter(r => !r.email || !r.email.trim().includes('@'));
        const failedRecipients: CampaignRecipientSnapshot[] = [];

        if (campaignSendType === 'group_to' || campaignSendType === 'group_bcc') {
          // Record any recipients without valid email as skipped/failed
          if (invalidRecipients.length > 0) {
            invalidRecipients.forEach(r => {
              const reasonText = !r.email || !r.email.trim() ? 'ไม่มีที่อยู่อีเมลในระบบ' : 'รูปแบบอีเมลไม่ถูกต้อง';
              progressLogs.push(`⚠️ [ข้ามการจัดส่ง] คุณ ${r.name} (${r.department || 'ไม่ระบุสังกัด'}) - ${reasonText}`);
              failedRecipients.push({
                id: r.id,
                name: r.name,
                email: r.email || '',
                position: r.position || '',
                department: r.department || '',
                reason: reasonText
              });
            });
            failCount += invalidRecipients.length;
          }

          if (validRecipients.length === 0) {
            alert('⚠️ ไม่มีผู้รับที่มีที่อยู่อีเมลในระบบเลยค่ะ กรุณาตรวจสอบหรือกรอกอีเมลให้ผู้รับก่อนส่งค่ะ');
            setSendingCampaignMessage(false);
            return;
          }

          // Send as group BCC or TO email
          const emailList = validRecipients.map(r => r.email.trim());
          const groupRecipient: Personnel = {
            id: 'all',
            name: 'ทุกท่าน',
            email: '',
            position: 'อาจารย์',
            department: 'มหาวิทยาลัยกรุงเทพ',
            phone: '',
            createdAt: ''
          };
          const personalizedSubject = renderTemplate(campaignSubject, groupRecipient, selectedCourse, true);
          const personalizedMessage = renderTemplate(campaignMessage, groupRecipient, selectedCourse, true);
          
          const posterUrl = selectedCourse.posterUrl || '';
          const regLink = `${getCleanOrigin()}/?courseId=${selectedCourse.id}`;
          
          let posterHtml = '';
          if (posterUrl) {
            posterHtml = `
              <div style="text-align: center; margin: 6px 0;">
                <img src="${posterUrl}" alt="${selectedCourse.title}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" />
              </div>
            `;
          }

          // Determine if the poster image is already embedded via placeholder in the message template to avoid duplicate rendering
          const hasPosterInTemplate = campaignMessage.includes('{course_poster}') || 
                                       campaignMessage.includes('{course_poster_html}') || 
                                       campaignMessage.includes('{course_poster_url}');

          const dynamicMessageStyle = `font-size: ${emailTextFontSize}; color: #334155; line-height: ${emailLineHeight}; word-break: ${emailWrapMode === 'keep_all' ? 'keep-all' : 'normal'}; overflow-wrap: break-word; line-break: loose; text-align: ${emailTextAlign}; margin-bottom: 20px; ${emailWrapMode === 'strict' ? 'white-space: pre-wrap;' : ''}`;

          const campaignHtmlBody = `
            <div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
              <div style='text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); padding: 20px; border-radius: 8px; color: #ffffff;'>
                <h3 style='margin: 0; font-size: 18px; font-weight: 800;'>สำนักมาตรฐานคุณภาพการศึกษา</h3>
                <p style='margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;'>มหาวิทยาลัยกรุงเทพ (Bangkok University)</p>
              </div>
              
              <div style='${dynamicMessageStyle}'>${formatMessageForHtml(personalizedMessage)}</div>
              
              ${hasPosterInTemplate ? '' : posterHtml}
              
              <div style='background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
                  <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #ea580c; font-size: 14px; word-break: normal; overflow-wrap: break-word;'>${selectedCourse.title}</strong></td></tr>
                  <tr><td style='padding: 6px 0;'><strong>วิทยากร:</strong></td><td>${selectedCourse.speaker}</td></tr>
                  <tr><td style='padding: 6px 0;'><strong>วันที่จัดงาน:</strong></td><td>${selectedCourse.date}</td></tr>
                  <tr><td style='padding: 6px 0;'><strong>เวลาอบรม:</strong></td><td>${selectedCourse.time} น.</td></tr>
                  <tr><td style='padding: 6px 0;'><strong>สถานที่:</strong></td><td>${selectedCourse.location}</td></tr>
                </table>
              </div>
              
              <div style='text-align: center; margin: 25px 0;'>
                <a href='${regLink}' style='background-color: #ea580c; color: #ffffff; padding: 12px 30px; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.2);'>คลิกที่นี่เพื่อลงทะเบียนเข้าร่วมอบรม</a>
              </div>
              
              <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
              <div style='text-align: center;'>
                <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
                <p style='font-size: 10px; color: #cbd5e1; margin-top: 4px;'>BU Training Management & Personnel Service Solutions</p>
              </div>
            </div>
          `;

          const posterAttach = getPosterAttachmentData(posterUrl);
          let finalCampaignHtmlBody = campaignHtmlBody;
          if (posterAttach && posterUrl) {
            finalCampaignHtmlBody = finalCampaignHtmlBody.split(posterUrl).join('cid:course_poster_cid');
          }

          const batchSize = 100;
          const totalRecipients = emailList.length;
          setCampaignProgress({ total: totalRecipients, sent: 0, logs: [] });

          for (let j = 0; j < totalRecipients; j += batchSize) {
            const batchEmails = emailList.slice(j, j + batchSize);
            const isGroupTo = campaignSendType === 'group_to';
            const payload = {
              action: 'campaign_invitation',
              email: isGroupTo ? batchEmails.join(",") : (userEmail || 'buqa@bu.ac.th'),
              ...(isGroupTo ? {} : { bccEmails: batchEmails }),
              ccEmail: campaignCcAdmin ? (campaignCcEmails.length > 0 ? campaignCcEmails.join(",") : (userEmail || 'buqa@bu.ac.th')) : undefined,
              subject: personalizedSubject,
              messageText: personalizedMessage,
              htmlBody: finalCampaignHtmlBody,
              courseId: selectedCourse.id,
              courseTitle: selectedCourse.title,
              recipientName: 'อาจารย์ทุกท่าน',
              ...(posterAttach ? {
                inlinePosterBase64: posterAttach.inlinePosterBase64,
                inlinePosterContentType: posterAttach.inlinePosterContentType
              } : {})
            };

            try {
              if (gasUrl) {
                const gasRes = await sendGasWebhook(gasUrl, payload);
                const actualCount = typeof gasRes.count === 'number' ? gasRes.count : (batchEmails.length - (gasRes.failedCount || 0));
                const failedBatchCount = gasRes.failedCount || 0;
                const dispatchLabel = isGroupTo ? "ส่งตรง TO" : "ส่งปิดบัง BCC";
                
                if (failedBatchCount > 0) {
                  progressLogs.push(`⚠️ [ส่งกลุ่มสำเร็จบางส่วน] รอบที่ ${Math.floor(j/batchSize) + 1} (${dispatchLabel}) ส่งสำเร็จ ${actualCount} คน, ล้มเหลว ${failedBatchCount} คน`);
                } else {
                  progressLogs.push(`✅ [ส่งกลุ่มสำเร็จ] รอบที่ ${Math.floor(j/batchSize) + 1} (${dispatchLabel}) หาผู้รับจำนวน ${actualCount} คน (ช่วงที่ ${j+1} - ${Math.min(j + batchSize, totalRecipients)})`);
                }
                successCount += actualCount;
                failCount += failedBatchCount;
              } else {
                await new Promise(resolve => setTimeout(resolve, 300));
                progressLogs.push(`✉️ [จำลองส่งกลุ่มสำเร็จ] รอบที่ ${Math.floor(j/batchSize) + 1} ส่งหาผู้รับจำนวน ${batchEmails.length} คน (${j+1} - ${Math.min(j + batchSize, totalRecipients)})`);
                successCount += batchEmails.length;
              }
              sentCount += batchEmails.length;
            } catch (err) {
              console.error(err);
              const errMsg = err instanceof Error ? err.message : String(err);
              progressLogs.push(`❌ [ข้อผิดพลาดส่งกลุ่ม] รอบที่ ${Math.floor(j/batchSize) + 1} ล้มเหลว: ${errMsg}`);
              failCount += batchEmails.length;
              sentCount += batchEmails.length;
              const failedBatchRecipients = validRecipients.slice(j, j + batchSize);
              failedBatchRecipients.forEach(r => {
                failedRecipients.push({
                  id: r.id,
                  name: r.name,
                  email: r.email,
                  position: r.position || '',
                  department: r.department || '',
                  reason: err instanceof Error ? err.message : 'เครือข่ายขัดข้อง / GAS ไม่ตอบสนอง'
                });
              });
            }
            setCampaignProgress(prev => prev ? { ...prev, sent: sentCount, logs: [...progressLogs] } : null);
          }
        } else {
          for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];

            // Validate recipient email
            if (!recipient.email || !recipient.email.trim().includes('@')) {
              const reasonText = !recipient.email || !recipient.email.trim() ? 'ไม่มีที่อยู่อีเมลในระบบ' : 'รูปแบบอีเมลไม่ถูกต้อง';
              progressLogs.push(`⚠️ [ข้ามการจัดส่ง] คุณ ${recipient.name} (${recipient.department || 'ไม่ระบุสังกัด'}) - ${reasonText}`);
              failCount++;
              sentCount++;
              failedRecipients.push({
                id: recipient.id,
                name: recipient.name,
                email: recipient.email || '',
                position: recipient.position || '',
                department: recipient.department || '',
                reason: reasonText
              });
              setCampaignProgress(prev => prev ? { ...prev, sent: sentCount, logs: [...progressLogs] } : null);
              continue;
            }

            const personalizedSubject = renderTemplate(campaignSubject, recipient, selectedCourse);
            const personalizedMessage = renderTemplate(campaignMessage, recipient, selectedCourse);
            
            const posterUrl = selectedCourse.posterUrl || '';
            const regLink = `${getCleanOrigin()}/?courseId=${selectedCourse.id}`;
            
            let posterHtml = '';
            if (posterUrl) {
              posterHtml = `
                <div style="text-align: center; margin: 6px 0;">
                  <img src="${posterUrl}" alt="${selectedCourse.title}" style="max-width: 100%; max-height: 350px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 6px 12px rgba(0,0,0,0.08);" />
                </div>
              `;
            }

            // Determine if the poster image is already embedded via placeholder in the message template to avoid duplicate rendering
            const hasPosterInTemplate = campaignMessage.includes('{course_poster}') || 
                                         campaignMessage.includes('{course_poster_html}') || 
                                         campaignMessage.includes('{course_poster_url}');

            const dynamicMessageStyle = `font-size: ${emailTextFontSize}; color: #334155; line-height: ${emailLineHeight}; word-break: ${emailWrapMode === 'keep_all' ? 'keep-all' : 'normal'}; overflow-wrap: break-word; line-break: loose; text-align: ${emailTextAlign}; margin-bottom: 20px; ${emailWrapMode === 'strict' ? 'white-space: pre-wrap;' : ''}`;

            const campaignHtmlBody = `
              <div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
                <div style='text-align: center; margin-bottom: 20px; background: linear-gradient(135deg, #ea580c 0%, #f97316 100%); padding: 20px; border-radius: 8px; color: #ffffff;'>
                  <h3 style='margin: 0; font-size: 18px; font-weight: 800;'>สำนักมาตรฐานคุณภาพการศึกษา</h3>
                  <p style='margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;'>มหาวิทยาลัยกรุงเทพ (Bangkok University)</p>
                </div>
                
                <div style='${dynamicMessageStyle}'>${formatMessageForHtml(personalizedMessage)}</div>
                
                ${hasPosterInTemplate ? '' : posterHtml}
                
                <div style='background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                  <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
                    <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #ea580c; font-size: 14px; word-break: normal; overflow-wrap: break-word;'>${selectedCourse.title}</strong></td></tr>
                    <tr><td style='padding: 6px 0;'><strong>วิทยากร:</strong></td><td>${selectedCourse.speaker}</td></tr>
                    <tr><td style='padding: 6px 0;'><strong>วันที่จัดงาน:</strong></td><td>${selectedCourse.date}</td></tr>
                    <tr><td style='padding: 6px 0;'><strong>เวลาอบรม:</strong></td><td>${selectedCourse.time} น.</td></tr>
                    <tr><td style='padding: 6px 0;'><strong>สถานที่:</strong></td><td>${selectedCourse.location}</td></tr>
                  </table>
                </div>
                
                <div style='text-align: center; margin: 25px 0;'>
                  <a href='${regLink}' style='background-color: #ea580c; color: #ffffff; padding: 12px 30px; text-decoration: none; font-size: 14px; font-weight: bold; border-radius: 8px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.2);'>คลิกที่นี่เพื่อลงทะเบียนเข้าร่วมอบรม</a>
                </div>
                
                <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
                <div style='text-align: center;'>
                  <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
                  <p style='font-size: 10px; color: #cbd5e1; margin-top: 4px;'>BU Training Management & Personnel Service Solutions</p>
                </div>
              </div>
            `;

            const posterAttach = getPosterAttachmentData(posterUrl);
            let finalCampaignHtmlBody = campaignHtmlBody;
            if (posterAttach && posterUrl) {
              finalCampaignHtmlBody = finalCampaignHtmlBody.split(posterUrl).join('cid:course_poster_cid');
            }

            const payload = {
              action: 'campaign_invitation',
              email: recipient.email,
              ccEmail: campaignCcAdmin ? (campaignCcEmails.length > 0 ? campaignCcEmails.join(",") : (userEmail || 'buqa@bu.ac.th')) : undefined,
              subject: personalizedSubject,
              messageText: personalizedMessage,
              htmlBody: finalCampaignHtmlBody,
              courseId: selectedCourse.id,
              courseTitle: selectedCourse.title,
              recipientName: recipient.name,
              recipientId: recipient.id,
              department: recipient.department,
              ...(posterAttach ? {
                inlinePosterBase64: posterAttach.inlinePosterBase64,
                inlinePosterContentType: posterAttach.inlinePosterContentType
              } : {})
            };

            // Gentle pacing so rapid individual dispatches do not exceed Google quotas
            if (gasUrl) {
              await new Promise(resolve => setTimeout(resolve, 350));
            } else {
              await new Promise(resolve => setTimeout(resolve, 200));
            }

            let success = false;
            let lastError = '';
            for (let attempt = 1; attempt <= 2 && !success; attempt++) {
              try {
                if (gasUrl) {
                  await sendGasWebhook(gasUrl, payload);
                  progressLogs.push(`✅ [ส่งจริงสำเร็จ] ไปยังคุณ ${recipient.name} สังกัด ${recipient.department} (${recipient.email})`);
                } else {
                  progressLogs.push(`✉️ [จำลองสำเร็จ] ร่างเนื้อหาเฉพาะบุคคล และจัดจดหมายเตรียมส่งหาคุณ ${recipient.name} (${recipient.email})`);
                }
                success = true;
              } catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                if (attempt === 1) {
                  await new Promise(resolve => setTimeout(resolve, 800));
                }
              }
            }

            if (success) {
              successCount++;
            } else {
              failCount++;
              progressLogs.push(`❌ [ข้อผิดพลาด] ส่งล้มเหลวไปยังคุณ ${recipient.name} (${recipient.email}): ${lastError}`);
              failedRecipients.push({
                id: recipient.id,
                name: recipient.name,
                email: recipient.email,
                position: recipient.position || '',
                department: recipient.department || '',
                reason: lastError || 'เครือข่ายขัดข้อง / GAS ไม่ตอบสนอง'
              });
            }
            sentCount++;
            setCampaignProgress(prev => prev ? { ...prev, sent: sentCount, logs: [...progressLogs] } : null);
          }
        }

        // Save Campaign Log to Firestore and Local Storage
        let targetDetailsText = 'บุคลากรทั้งหมด';
        if (campaignTargetType === 'custom_dept') {
          targetDetailsText = `หน่วยงาน/สังกัด: ${campaignDepts.join(', ')}`;
        } else if (campaignTargetType === 'position') {
          targetDetailsText = `ประเภท/ตำแหน่ง: ${campaignPositions.join(', ')}`;
        } else if (campaignTargetType === 'specific_personnel') {
          targetDetailsText = `เลือกเจาะจงรายบุคคล: ${recipients.length} คน`;
        }

        const resolvedSubject = (campaignSubject || '').replace(/{course_title}/g, selectedCourse.title || '');
        const campaignLogId = `camp_${Date.now()}`;
        const newCampaignLog: CampaignLog = {
          id: campaignLogId,
          courseId: selectedCourse.id,
          courseTitle: selectedCourse.title,
          subject: resolvedSubject,
          message: campaignMessage,
          targetType: campaignTargetType,
          targetDetails: targetDetailsText,
          recipientsCount: recipients.length,
          successCount: successCount,
          failCount: failCount,
          sentAt: new Date().toISOString(),
          sentBy: userEmail || 'buqa@bu.ac.th',
          sendType: campaignSendType,
          logs: progressLogs,
          ...(campaignTargetType === 'position' && campaignPositions.length > 0 ? { targetPositions: [...campaignPositions] } : {}),
          ...(campaignTargetType === 'custom_dept' && campaignDepts.length > 0 ? { targetDepts: [...campaignDepts] } : {}),
          recipientEmails: validRecipients.map(r => r.email).filter((e): e is string => Boolean(e)),
          recipientIds: recipients.map(r => r.id),
          recipientsSnapshot: recipients.map(r => ({
            id: r.id,
            name: r.name,
            email: r.email || '',
            position: r.position || '',
            department: r.department || ''
          })),
          failedRecipients: failedRecipients
        };

        await saveCampaignLog(newCampaignLog);

        setSendingCampaignMessage(false);
        if (failCount > 0) {
          alert(`📧 การจัดส่งเสร็จสิ้น:\n\n• ส่งสำเร็จ: ${successCount} ฉบับ\n• ส่งไม่สำเร็จ/ข้าม: ${failCount} ท่าน\n\n💡 คุณสามารถคลิกปุ่ม "ส่งซ้ำคนที่ไม่สำเร็จ" หรือกด "ดูบันทึก" ในตารางประวัติด้านล่าง เพื่อดูรายชื่อและลองส่งใหม่ได้ตลอดเวลาค่ะ`);
        } else {
          alert(`🎉 จัดส่งจดหมายเชิญอบรมเข้ากลุ่มเป้าหมายสำเร็จครบถ้วนทั้งสิ้น ${successCount} ฉบับ (100%) และบันทึกประวัติการส่งเรียบร้อยค่ะ!`);
        }
      },
      {
        confirmText: 'ยืนยันและเริ่มส่งจดหมาย',
        cancelText: 'ยกเลิก',
        isDestructive: false
      }
    );
  };

  const handleSendTestEmail = async () => {
    if (!gasUrl) {
      alert('⚠️ โปรดกรอก Google Apps Script Web App URL ในเมนูเชื่อมต่อก่อนเริ่มส่งทดสอบค่ะ');
      return;
    }
    if (!testEmailAddress.trim()) {
      alert('⚠️ โปรดพิมพ์อีเมลผู้รับสำหรับส่งทดสอบค่ะ');
      return;
    }

    setSendingTestEmail(true);
    const selectedCourse = courses.find(c => c.id === campaignCourseId) || courses[0] || {
      title: 'หลักสูตรอบรมวิชาการพัฒนาบุคลากรยุคสารสนเทศ',
      speaker: 'ดร.สมชาย ใจดี',
      date: '15 มิ.ย. 2569',
      time: '09:00 - 12:00 น.',
      location: 'ห้องประชุม IT-401 อาคารเทคโนโลยี มหาวิทยาลัยกรุงเทพ'
    };

    const payload = {
      action: 'campaign_invitation',
      email: testEmailAddress.trim(),
      subject: `🧪 [ทดสอบการทำงาน] ขอเรียนเชิญอบรมในหัวข้อ "${selectedCourse.title}"`,
      messageText: `เรียน อาจารย์/บุคลากรที่รับผิดชอบ,\n\nยินดีด้วยค่ะ! บริการส่งเมล์ผ่าน Google Apps Script ทำงานทดสอบเชื่อมโยงได้สำเร็จเรียบร้อยแล้ว\n\nรายละเอียดหลักสูตรเรียนรู้:\n- หลักสูตร: ${selectedCourse.title}\n- วิทยากร: ${selectedCourse.speaker}\n- วันเวลา: ${selectedCourse.date} (${selectedCourse.time})\n- สถานที่: ${selectedCourse.location}\n- ลิงก์อำนวยความสะดวก: ${getCleanOrigin()}\n\nหากได้รับอีเมลฉบับนี้ แสดงว่าท่านได้ผูกความเหมาะสมของ API Key และ URL ปลายทางเข้าสู่ระบบพิจารณาสมรรถนะเสร็จสิ้นแล้ว และสามารถสั่งกระจายเมลจริงแก่บุคลากรทั้งหมดภายในโดเมนได้ทันทีค่ะ 🎉`
    };

    try {
      await sendGasWebhook(gasUrl, payload);
      alert(`🎉 [จัดส่งสำเร็จ] ระบบได้ทำการส่งเมลทดสอบไปยัง "${testEmailAddress}" ผ่าน Google Apps Script เรียบร้อยแล้วค่ะ!\n\nกรุณาใช้เวลาประมาณ 1-2 นาทีในการเข้าเช็กกล่องอีเมลขาเข้า (Inbox) หรือโฟลเดอร์จดหมายขยะ (Spam) เพื่อยืนยันว่าการตั้งค่านั้นสมบูรณ์`);
    } catch (err) {
      console.error(err);
      alert('❌ เกิดข้อผิดพลาดในการส่งอีเมลทดสอบ:\n' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSendingTestEmail(false);
    }
  };

  // Export Course registrations metrics spreadsheet
  const handleExportCourseData = (course: Course) => {
    const matched = registrations
      .filter(r => r.courseId === course.id)
      .sort((a, b) => {
        const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
        return timeA - timeB;
      });
    if (matched.length === 0) {
      alert('ไม่มีข้อมูลรายงานสำหรับส่งออกในกิจกรรมรอบนี้');
      return;
    }

    const headers = ['รหัสบุคลากร', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'สังกัด/ฝ่าย', 'อีเมล', 'สิทธิ์/สถานะเช็คอิน', 'วันที่สแกน', 'คะแนนความพึงพอใจ', 'ระดับการแนะนำ', 'ข้อเสนอแนะเพิ่มเติม'];
    const rows = matched.map(m => {
      const p = personnel.find(x => (m.personnelId && x.id === m.personnelId) || (m.email && x.email && x.email.toLowerCase() === m.email.toLowerCase()));
      const pId = p?.id || m.personnelId || '-';
      const pName = p?.name || m.name || '-';
      const pPos = p?.position || m.position || '-';
      const pEmail = p?.email || m.email || '-';
      const pDept = p?.department || m.department || '-';

      return [
        pId,
        pName,
        pPos,
        pDept,
        pEmail,
        m.checkedIn ? 'เช็คอินแล้ว' : 'ลงทะเบียนรอเข้าอบรม',
        m.checkedInAt ? new Date(m.checkedInAt).toLocaleString('th-TH') : '-',
        m.feedback ? String(m.feedback.satisfaction) : '-',
        m.feedback ? String(m.feedback.recommendation ?? '-') : '-',
        m.feedback ? m.feedback.comments || '-' : '-'
      ];
    });

    downloadCSV(`รายงาน_อบรม_${course.title}.csv`, headers, rows);
  };

  // Generate overview data calculations
  const isAllCourses = selectedDashboardCourseId === 'all';
  const selectedDashboardCourse = courses.find(c => c.id === selectedDashboardCourseId);

  const dashboardRegs = isAllCourses 
    ? registrations 
    : registrations.filter(r => r.courseId === selectedDashboardCourseId);

  const totalRegCount = dashboardRegs.length;
  const checkedInCount = dashboardRegs.filter(r => r.checkedIn).length;
  const attendanceRate = totalRegCount > 0 ? Math.round((checkedInCount / totalRegCount) * 100) : 0;

  // Average overall satisfaction (out of 5)
  const ratedRegs = dashboardRegs.filter(r => r.feedback && r.feedback.satisfaction);
  const rawAvgSatisfaction = ratedRegs.length > 0
    ? Number((ratedRegs.reduce((acc, current) => acc + (current.feedback?.satisfaction || 0), 0) / ratedRegs.length).toFixed(2))
    : 0;
  const avgSatisfactionPercent = rawAvgSatisfaction > 0 ? Math.round(rawAvgSatisfaction * 20) : 0;

  // Average recommendation score (out of 5)
  const ratedRecs = dashboardRegs.filter(r => r.feedback && r.feedback.recommendation !== undefined);
  const rawAvgRecommendation = ratedRecs.length > 0
    ? Number((ratedRecs.reduce((acc, current) => acc + (current.feedback?.recommendation || 0), 0) / ratedRecs.length).toFixed(2))
    : 0;

  // Ratings distribution (1-5 stars) for specific course view
  const singleCourseRatingData = [1, 2, 3, 4, 5].map(star => {
    const count = ratedRegs.filter(r => r.feedback?.satisfaction === star).length;
    const percentage = ratedRegs.length > 0 ? Math.round((count / ratedRegs.length) * 100) : 0;
    return {
      name: `${star} ดาว`,
      'จำนวนผู้ให้คะแนน': count,
      'สัดส่วน (%)': percentage
    };
  });

  // Prepare chart metrics comparing presence vs feedback
  const chartData = courses.map(c => {
    const courseRegs = registrations.filter(r => r.courseId === c.id);
    const total = courseRegs.length;
    const presence = courseRegs.filter(r => r.checkedIn).length;
    const rate = total > 0 ? (presence / total) * 100 : 0;
    
    const rated = courseRegs.filter(r => r.feedback && r.feedback.satisfaction);
    const satisfaction = rated.length > 0 
      ? (rated.reduce((acc, curr) => acc + (curr.feedback?.satisfaction || 0), 0) / rated.length) * 20
      : 0;

    return {
      name: c.title.length > 20 ? c.title.substring(0, 20) + '...' : c.title,
      'อัตราเข้าอบรม (%)': Math.round(rate),
      'ความพึงพอใจ/คะแนน (%)': Math.round(satisfaction),
      'ผู้ลงทะเบียน': total
    };
  });

  // Department distribution pie data 
  const deptMap: { [key: string]: number } = {};
  dashboardRegs.forEach(r => {
    deptMap[r.department] = (deptMap[r.department] || 0) + 1;
  });
  const deptChartData = Object.keys(deptMap).map(key => ({
    name: key,
    value: deptMap[key]
  })).sort((a, b) => b.value - a.value);

  const COLORS = ['#ea580c', '#3b82f6', '#10b981', '#a855f7', '#f43f5e', '#64748b', '#06b6d4', '#eab308'];

  // Export Summary of All Courses Metrics as CSV
  const handleExportAllCoursesSummary = () => {
    if (courses.length === 0) {
      alert('ไม่มีข้อมูลโครงการอบรมสำหรับส่งออก');
      return;
    }

    const headers = [
      'ลำดับที่',
      'ชื่อหลักสูตรอบรม',
      'วิทยากร/คณะผู้บรรยาย',
      'วันที่จัดโครงการ',
      'เวลาจัดสัมมนา',
      'สถานที่อบรมสัมมนา',
      'จำนวนผู้ลงทะเบียนทั้งหมด (ที่นั่ง)',
      'จำนวนผู้เช็คอินจริง (คน)',
      'อัตราการเข้าอบรม (%)',
      'จำนวนแบบประเมินที่ส่งกลับ',
      'คะแนนความพึงพอใจเฉลี่ย (เต็ม 5)',
      'คะแนนความพึงพอใจเฉลี่ย (%)',
      'คะแนนแนะนำต่อเฉลี่ย (เต็ม 5)'
    ];

    const rows = courses.map((c, index) => {
      const courseRegs = registrations.filter(r => r.courseId === c.id);
      const total = courseRegs.length;
      const presence = courseRegs.filter(r => r.checkedIn).length;
      const rate = total > 0 ? Math.round((presence / total) * 100) : 0;

      const rated = courseRegs.filter(r => r.feedback && r.feedback.satisfaction);
      const avgSat = rated.length > 0
        ? Number((rated.reduce((acc, curr) => acc + (curr.feedback?.satisfaction || 0), 0) / rated.length).toFixed(2))
        : 0;
      const avgSatPercent = Math.round(avgSat * 20);

      const ratedRec = courseRegs.filter(r => r.feedback && r.feedback.recommendation !== undefined);
      const avgRec = ratedRec.length > 0
        ? Number((ratedRec.reduce((acc, curr) => acc + (curr.feedback?.recommendation || 0), 0) / ratedRec.length).toFixed(2))
        : 0;

      return [
        index + 1,
        c.title,
        c.speaker,
        c.date,
        c.time,
        c.location,
        total,
        presence,
        rate,
        rated.length,
        avgSat,
        avgSatPercent,
        avgRec || '-'
      ];
    });

    downloadCSV('รายงานภาพรวมสรุปสถิติทุกโครงการอบรม.csv', headers, rows);
  };

  // Personnel searchable grid & pagination
  const searchedPersonnel = personnel
    .filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.position || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getDisplayCurriculum(p.curriculum, p.department).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.academicDepartment || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.phone || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const idA = (a.id || '').trim();
      const idB = (b.id || '').trim();
      const cmp = idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      return personnelSortOrder === 'asc' ? cmp : -cmp;
    });

  const paginatedPersonnel = searchedPersonnel.slice(
    (personnelPage - 1) * itemsPerPage,
    personnelPage * itemsPerPage
  );

  const totalPersonnelPages = Math.ceil(searchedPersonnel.length / itemsPerPage) || 1;

  const currentAdminProfile = adminsList.find(adm => adm.email.toLowerCase() === userEmail.toLowerCase());

  const filteredCoursesForAdmin = courses.filter(c => {
    if (courseFilter === 'active') return !c.archived;
    if (courseFilter === 'archived') return !!c.archived;
    return true;
  });

  const filteredCampaignLogs = campaignLogs.filter(log => {
    // Filter by archive status
    if (campaignLogFilter === 'active' && log.archived) return false;
    if (campaignLogFilter === 'archived' && !log.archived) return false;
    
    // Filter by search query
    if (campaignSearchQuery.trim()) {
      const q = campaignSearchQuery.toLowerCase();
      const matchTitle = (log.courseTitle || '').toLowerCase().includes(q);
      const matchSubject = (log.subject || '').toLowerCase().includes(q);
      const matchTarget = (log.targetDetails || '').toLowerCase().includes(q);
      const matchSender = (log.sentBy || '').toLowerCase().includes(q);
      return matchTitle || matchSubject || matchTarget || matchSender;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="admin-portal-container">
      {/* 1. TOP NAVIGATION / HEADER */}
      <header className="w-full bg-slate-900 text-slate-100 flex flex-col border-b border-slate-800 z-10" id="admin-top-nav">
        {/* Upper Top Bar: Logo & Admin profile */}
        <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 gap-4" id="top-nav-logo-bar">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center font-black text-white text-lg shadow-md shadow-orange-500/20">
              BU
            </span>
            <div>
              <h2 className="text-sm font-black tracking-wide text-white uppercase leading-none">BU Training</h2>
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase leading-none">Management System</p>
            </div>
          </div>

          {/* Right Admin info */}
          <div className="flex items-center gap-4 text-xs" id="top-nav-profile">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[8px] bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded border border-orange-500/30">ADMIN</span>
              <div className="text-left">
                <p className="font-bold text-slate-200 text-xs leading-tight">{currentAdminProfile ? currentAdminProfile.name : userName}</p>
                <p className="text-slate-500 font-mono text-[9px]">{userEmail}</p>
              </div>
            </div>
            <div className="h-6 w-[1px] bg-slate-800 hidden sm:block"></div>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="text-xs font-bold text-slate-400 hover:text-rose-450 transition cursor-pointer"
              title="ออกจากเว็บบริการแอดมิน"
            >
              [ออกจากระบบแอดมิน]
            </button>
          </div>
        </div>

        {/* Horizontal Navigation Tab Bar */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 bg-slate-950/40" id="top-nav-tabs">
          <nav className="flex items-center gap-1.5 p-3 min-w-max mx-2" id="top-nav-menu">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Target className="h-4 w-4" />
              <span>แดชบอร์ดสรุปภาพรวม</span>
            </button>

            <button
              onClick={() => setActiveTab('courses')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'courses'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>จัดการหลักสูตรอบรม</span>
            </button>

            <button
              onClick={() => {
                if (courses.length > 0 && !selectedCourseId) {
                  setSelectedCourseId(courses[0].id);
                }
                setActiveTab('applicants');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'applicants'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>รายชื่อผู้สมัครอบรม</span>
            </button>

            <button
              onClick={() => setActiveTab('personnel')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'personnel'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>ข้อมูลและบัญชีอาจารย์</span>
            </button>

            <button
              onClick={() => setActiveTab('invitations')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'invitations'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Mail className="h-4 w-4" />
              <span>ระบบส่งเมลเชิญอบรม</span>
            </button>

            <button
              onClick={() => {
                if (courses.length > 0 && !selectedCourseId) {
                  setSelectedCourseId(courses[0].id);
                }
                setActiveTab('evaluations');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'evaluations'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Award className="h-4 w-4" />
              <span>ผลการประเมินวิจัย</span>
            </button>

            <button
              onClick={() => setActiveTab('admins')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'admins'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/15'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Shield className="h-4 w-4" />
              <span>สิทธิ์ผู้ดูแลระบบ</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>ตั้งค่าระบบทางเทคนิค</span>
            </button>
          </nav>
        </div>
      </header>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 p-6 md:p-8 overflow-x-hidden space-y-6" id="admin-main-pane">
        {/* Top Header Bar inside content */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm" id="content-header-bar">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">BU Training Management System</h1>
              <p className="text-[11px] font-bold text-slate-400 mt-1">LEARNING DEVELOPMENT OFFICE (ADMIN PORTAL)</p>
            </div>
          </div>

          <div className="flex items-center gap-3" id="top-header-right-actions">
            <span className="text-[11px] font-bold text-slate-400">สถานะแผง: <strong className="text-emerald-600">ONLINE ● L&D</strong></span>
          </div>
        </header>

        {loading ? (
          <div className="py-20 text-center text-slate-400">กำลังเชื่อมฐานข้อมูล Firestore...</div>
      ) : activeTab === 'dashboard' ? (
        /* Executive Dashboard tab */
        <div className="space-y-8" id="dashboard-tab-content">
          {/* Dashboard Scope Filter Card */}
          <div className="bg-white border border-slate-200/85 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm md:text-base font-black text-slate-800 flex items-center gap-2">
                <Filter className="h-5 w-5 text-orange-500" />
                <span>ตัวกรองและขอบเขตวิเคราะห์โครงการอบรม</span>
              </h2>
              <p className="text-[11px] text-slate-405 font-sans leading-relaxed">
                {isAllCourses 
                  ? '📊 กำลังแสดงรายงานสรุปสถิติจำนวนรวมสะสมของ "ทุกโครงการอบรมทั้งหมด" ในระบบ' 
                  : `🎯 กำลังแสดงรายงานวิเคราะห์เจาะลึกเฉพาะหัวข้อ: "${selectedDashboardCourse?.title}"`}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={selectedDashboardCourseId}
                onChange={(e) => setSelectedDashboardCourseId(e.target.value)}
                className="bg-slate-50 border border-slate-250 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold focus:outline-none focus:border-orange-500 cursor-pointer min-h-[40px] max-w-full sm:max-w-xs md:max-w-md truncate shadow-3xs"
              >
                <option value="all">🌐 ภาพรวมรวมสะสมทุกหลักสูตร (All Courses)</option>
                {courses.filter(c => !c.archived || c.id === selectedDashboardCourseId || showArchivedInDropdown).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.archived ? '📁 [จัดเก็บแล้ว] ' : '📖 '}{c.title} ({c.date})
                  </option>
                ))}
              </select>

              {isAllCourses ? (
                <button
                  type="button"
                  onClick={handleExportAllCoursesSummary}
                  className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm min-h-[40px] cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>ส่งออกสถิติทุกวิชา (CSV)</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectedDashboardCourse && handleExportCourseData(selectedDashboardCourse)}
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm min-h-[40px] cursor-pointer"
                    title="ส่งออกรายชื่อผู้ลงทะเบียนและแบบประเมิน"
                  >
                    <Download className="h-4 w-4" />
                    <span>ดึงรายชื่อและผลประเมิน (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDashboardCourseId('all')}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition border border-slate-200 min-h-[40px] cursor-pointer"
                  >
                    <span>ล้างตัวกรอง</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Key Metrics Banners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="stats-grid">
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow relative">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">จำนวนผู้ลงทะเบียน</p>
                  <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">{totalRegCount} ที่นั่ง</h3>
                </div>
                <span className="p-3 bg-orange-50 text-orange-600 rounded-xl">
                  <Users className="h-5 w-5" />
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-4 font-sans">
                {isAllCourses ? 'รวมทุกวิชาวิทยากรในระบบสะสม' : `เฉพาะหัวข้อการสัมมนาวิชาการนี้`}
              </p>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow relative">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">ยอดผู้เข้ารับการเช็คอิน</p>
                  <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">{checkedInCount} คน</h3>
                </div>
                <span className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle className="h-5 w-5" />
                </span>
              </div>
              <p className="text-xs text-emerald-600 mt-4 font-bold flex items-center gap-1 font-sans">
                <span>คิดเป็นร้อยละ {attendanceRate}% ของยอดสำรองสิทธิ์</span>
              </p>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow relative">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">ระดับความพึงพอใจเฉลี่ย</p>
                  <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">
                    {rawAvgSatisfaction > 0 ? `★ ${rawAvgSatisfaction} / 5` : '-'}
                  </h3>
                </div>
                <span className="p-3 bg-amber-50 text-amber-500 rounded-xl">
                  <Target className="h-5 w-5" />
                </span>
              </div>
              <p className="text-xs text-slate-405 mt-4 font-bold font-sans">
                {avgSatisfactionPercent > 0 
                  ? `เทียบเป็นเปอร์เซ็นต์ได้ ${avgSatisfactionPercent}% (${ratedRegs.length} ผู้ประเมิน)` 
                  : 'ยังไม่มีผู้ทำแบบประเมินผลความพึงพอใจ'}
              </p>
            </div>

            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow relative">
              <div className="flex justify-between items-start">
                {isAllCourses ? (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">จำนวนโครงการอบรมสัมมนา</p>
                    <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">{courses.length} หัวข้อ</h3>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">การแนะนำหลักสูตรต่อ</p>
                    <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mt-1">
                      {rawAvgRecommendation > 0 ? `★ ${rawAvgRecommendation} / 5` : '-'}
                    </h3>
                  </div>
                )}
                <span className="p-3 bg-slate-100 text-slate-800 rounded-xl">
                  <Landmark className="h-5 w-5" />
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-4 font-bold font-sans">
                {isAllCourses 
                  ? 'จากกำลังโครงสร้างโครงการปีปัจจุบัน' 
                  : `จากระดับ 5 ดาวความพร้อมแนะนำต่อเพื่อนพนักงาน`}
              </p>
            </div>
          </div>

          {/* Charts section with Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-charts">
            
            {isAllCourses ? (
              /* All Courses view - Presence vs Rating comparison chart */
              <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm col-span-2">
                <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-600" />
                  <span>วิเคราะห์เปรียบเทียบอัตราเข้าร่วมและระดับคะแนนความประเมิน (%)</span>
                </h3>
                
                {chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-xs font-sans">ยังไม่มีชุดข้อมูลสรุปทางสถิติรองรับการวิเคราะห์</div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} tickLine={false} />
                        <Tooltip contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Bar dataKey="อัตราเข้าอบรม (%)" fill="#ea580c" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="ความพึงพอใจ/คะแนน (%)" fill="#334155" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              /* Specific Course view - Detailed rating distribution 1-5 stars */
              <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm col-span-2">
                <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-600" />
                  <span>การแจกแจงคะแนนแบบประเมินความพึงพอใจหลักสูตร (จำนวนคนแยกตามดาว)</span>
                </h3>
                
                {ratedRegs.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl font-sans">
                    ยังไม่มีข้อมูลแบบประเมินผลความพึงพอใจในวิชาการรอบนี้
                  </div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={singleCourseRatingData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <Tooltip contentStyle={{ background: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '11px' }} />
                        <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                        <Bar name="จำนวนผู้ให้คะแนน (คน)" dataKey="จำนวนผู้ให้คะแนน" fill="#ea580c" radius={[4, 4, 0, 0]} />
                        <Bar name="สัดส่วนเปอร์เซ็นต์ (%)" dataKey="สัดส่วน (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Department share Pie */}
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
              <h3 className="text-base font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-600" />
                <span>{isAllCourses ? 'สัดส่วนการมีส่วนร่วมแยกตามสังกัดรวม' : 'สัดส่วนผู้เข้าร่วมแยกตามสังกัดวิชา'}</span>
              </h3>
              
              {deptChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-400 text-xs text-center border border-dashed border-slate-200 rounded-xl p-6 font-sans">
                  ไม่มีสัดส่วนสถิติสังกัด เนื่องจากยังไม่มีบุคลากรมาทำกิจกรรมในระบบ
                </div>
              ) : (
                <div className="h-72 flex flex-col justify-between">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deptChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {deptChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500 max-h-[72px] overflow-y-auto">
                    {deptChartData.slice(0, 8).map((entry, index) => (
                      <span key={entry.name} className="flex items-center gap-1 font-sans">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        {entry.name} ({entry.value})
                      </span>
                    ))}
                    {deptChartData.length > 8 && (
                      <span className="text-slate-400">และอื่น ๆ อีก {deptChartData.length - 8} สังกัด</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* DETAILED STATISTICAL TABLE OF ALL COURSES (ดึงข้อมูล/วิเคราะห์สถิติต่อ) */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-855 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-orange-500" />
                  <span>ตารางวิเคราะห์สถิติสรุปผลดำเนินงานรายหลักสูตร (Courses Analytics Matrix)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-sans leading-relaxed">
                  ตารางรายงานสรุปความพึงพอใจและอัตราเข้าเช็คอินของทุกหัวข้อ สามารถดึงข้อมูลดิบไปจัดพิมพ์หรือใช้วิเคราะห์ต่อยอดในโปรแกรมประมวลผลภายนอกได้
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportAllCoursesSummary}
                className="px-4 py-2.5 bg-slate-50 border border-slate-250 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer shadow-3xs min-h-[40px]"
              >
                <Download className="h-4 w-4 text-slate-500" />
                <span>ดาวน์โหลดข้อมูลภาพรวมสรุปทุกหลักสูตร (CSV)</span>
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-150 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-slate-600 font-bold font-sans">
                    <th className="p-3">หัวข้อหลักสูตรอบรมสัมมนา</th>
                    <th className="p-3 text-center">ผู้ลงทะเบียนสะสม</th>
                    <th className="p-3 text-center">ผู้เข้าร่วมเช็คอิน</th>
                    <th className="p-3 text-center">อัตราเข้าอบรม</th>
                    <th className="p-3 text-center">จำนวนแบบประเมิน</th>
                    <th className="p-3 text-center">คะแนนเฉลี่ย</th>
                    <th className="p-3 text-center">คะแนนเปอร์เซ็นต์</th>
                    <th className="p-3 text-center">จัดการดูสถิติ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700 font-sans">
                  {courses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400 italic">ยังไม่มีข้อมูลโครงการอบรมสัมมนาในระบบฐานข้อมูล</td>
                    </tr>
                  ) : (
                    courses.map(c => {
                      const courseRegs = registrations.filter(r => r.courseId === c.id);
                      const total = courseRegs.length;
                      const presence = courseRegs.filter(r => r.checkedIn).length;
                      const rate = total > 0 ? Math.round((presence / total) * 100) : 0;

                      const rated = courseRegs.filter(r => r.feedback && r.feedback.satisfaction);
                      const avgSat = rated.length > 0
                        ? Number((rated.reduce((acc, curr) => acc + (curr.feedback?.satisfaction || 0), 0) / rated.length).toFixed(2))
                        : 0;
                      const avgSatPercent = Math.round(avgSat * 20);

                      const isCurrentSelected = selectedDashboardCourseId === c.id;

                      return (
                        <tr key={c.id} className={`hover:bg-slate-50/55 transition-all ${isCurrentSelected ? 'bg-orange-50/40 font-medium' : ''}`}>
                          <td className="p-3 max-w-xs sm:max-w-md truncate">
                            <span className="font-extrabold text-slate-900 block leading-tight">{c.title}</span>
                            <span className="text-[10px] text-slate-450 block mt-1">วิทยากร: {c.speaker} | วันจัด: {c.date}</span>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-800">{total}{c.maxSeats ? ` / ${c.maxSeats}` : ''} ที่นั่ง</td>
                          <td className="p-3 text-center font-bold text-emerald-700">{presence} คน</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rate >= 80 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                              rate >= 50 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                              'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}>
                              {rate}%
                            </span>
                          </td>
                          <td className="p-3 text-center text-slate-500">{rated.length} ฉบับ</td>
                          <td className="p-3 text-center font-bold text-amber-600">
                            {avgSat > 0 ? `★ ${avgSat}` : '-'}
                          </td>
                          <td className="p-3 text-center font-bold">
                            {avgSatPercent > 0 ? `${avgSatPercent}%` : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedDashboardCourseId(c.id)}
                              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all shadow-3xs cursor-pointer min-h-[28px] ${
                                isCurrentSelected
                                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              {isCurrentSelected ? 'กำลังวิเคราะห์' : 'เจาะลึกสถิติ'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* INDIVIDUAL TRACKING PLATFORM */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-lg" id="individual-tracker-panel">
            <div className="relative z-10 w-full">
              <span className="bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest flex items-center w-fit gap-1 mb-4">
                <Sparkles className="h-3.5 w-3.5 text-white animate-pulse" />
                ระบบสืบค้นข้อมูลเข้ารับการตอบแทนเป็นรายบุคคล (Individual Tracking)
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-white font-sans">ตรวจจับแฟ้มผลการอบรมอาจารย์สัญชาตลักษณ์</h2>
              <p className="text-slate-300 text-sm mt-1 max-w-xl font-sans">
                กรอกรหัสบุคลากร หรืออีเมลบัญชีผู้ใช้ @bu.ac.th เพื่อเรียกดูรายงานสรุปชั่วโมงสะสมพร้อมแฟ้มประวัติ!
              </p>

              {/* SEARCH SECTION */}
              <div className="flex flex-col sm:flex-row gap-3 mt-6 max-w-lg">
                <input
                  type="text"
                  placeholder="กรอกรหัสบุคลากร หรืออีเมล..."
                  value={trackerQuery}
                  onChange={(e) => setTrackerQuery(e.target.value)}
                  className="flex-1 bg-slate-800 text-white placeholder-slate-400 border border-slate-700 px-4 py-2.5 rounded-xl text-xs focus:outline-none focus:border-orange-500 font-sans font-medium"
                />
                <button
                  type="button"
                  onClick={handleTrackerSearch}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs transition shadow-md min-h-[44px]"
                >
                  สืบค้นประวัติ
                </button>
              </div>

              {/* TRACKER RESULT SECTION */}
              {trackerResult && (
                <div className="mt-8 bg-slate-800/80 border border-slate-700 p-6 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
                  {trackerResult.person ? (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-700 pb-4">
                        <div>
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Users className="h-5 w-5 text-orange-500" />
                            <span>{trackerResult.person.name}</span>
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">{trackerResult.person.position} • {trackerResult.person.department}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-xs font-mono font-bold bg-slate-700 px-2.5 py-1 rounded-lg text-slate-300">
                            ID: {trackerResult.person.id}
                          </span>
                          <p className="text-[11px] text-slate-400 font-mono mt-1">{trackerResult.person.email}</p>
                        </div>
                      </div>

                      {/* Training footprint summary */}
                      {(() => {
                        const attended = trackerResult.history.filter(h => h.registration.checkedIn);
                        const totalHours = attended.length * 3;
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 bg-slate-900/55 border border-slate-750 rounded-xl">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">หลักสูตรลงทะเบียนทั้งหมด</p>
                              <h4 className="text-xl font-black text-white mt-1 font-sans">{trackerResult.history.length} วิชา</h4>
                            </div>
                            <div className="p-4 bg-slate-900/55 border border-slate-750 rounded-xl">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">ผ่านการรับรองเข้าอบรมสำเร็จ</p>
                              <h4 className="text-xl font-black text-emerald-400 mt-1 font-sans">{attended.length} วิชา</h4>
                            </div>
                            <div className="p-4 bg-slate-900/55 border border-slate-750 rounded-xl">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">ชั่วโมงวิชาการสะสมพัฒนาตนเอง</p>
                              <h4 className="text-xl font-black text-orange-400 mt-1 font-sans">{totalHours} ชั่วโมง</h4>
                            </div>
                          </div>
                        );
                      })()}

                      {/* History list of courses */}
                      <div className="space-y-2 pt-2">
                        <p className="text-[10px] font-bold text-slate-450 uppercase tracking-wider font-sans">บันทึกประวัติการผ่านโครงการอบรมพัฒนา:</p>
                        {trackerResult.history.length === 0 ? (
                          <p className="text-xs text-slate-400 italic font-sans animate-pulse">ไม่มีข้อมูลการลงทะเบียนในระบบ</p>
                        ) : (
                          <div className="divide-y divide-slate-700 max-h-60 overflow-y-auto pr-1">
                            {trackerResult.history.map(({ course, registration }) => (
                              <div key={registration.id} className="py-2.5 flex justify-between items-center text-xs">
                                <div>
                                  <p className="font-bold text-white font-sans">{course.title}</p>
                                  <p className="text-slate-400 text-[10px] font-sans">วิทยากร: {course.speaker} • วันที่: {course.date}</p>
                                </div>
                                <div className="text-right">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    registration.checkedIn 
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  }`}>
                                    {registration.checkedIn ? 'สำเร็จการอบรม' : 'ไม่ได้เช็คอิน'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-slate-400 text-xs font-sans">
                      ไม่พบบุคลากรที่มีข้อมูลตรงกับ "{trackerQuery}" ในฐานข้อมูล
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'courses' ? (
        <div className="space-y-8" id="courses-tab-content">
          
          {/* Header of Courses page & Add New Course button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-orange-600" />
                <span>การบริหารการจัดอบรมและเช็คอินหลักสูตร</span>
              </h2>
              <p className="text-xs text-slate-405 mt-1 font-sans">ตั้งค่าเปิดปิดเช็คอิน จัดกลุ่มเป้าหมาย จัดการผู้เข้าอบรม และพิมพ์สถิติส่งออก</p>
            </div>
            {!showCourseForm && !editingCourseId && (
              <button
                onClick={() => {
                  setCourseForm({
                    title: '', speaker: '', date: '', time: '', location: '', description: '',
                    posterUrl: '', qrOpened: false, qrOpenTime: '', qrCloseTime: '',
                    registrationCloseTime: '', registeredCount: 0, targetPositions: [], targetPersonnelIds: [],
                    customSurveyUrl: '', visible: true, maxSeats: undefined, archived: false, restrictToTargets: false
                  });
                  setEditingCourseId(null);
                  setShowCourseForm(true);
                }}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-md transition duration-155 flex items-center gap-1.5 min-h-[44px]"
                id="btn-add-course"
              >
                <PlusCircle className="h-4.5 w-4.5" />
                <span>สร้างหลักสูตรอบรมใหม่</span>
              </button>
            )}
          </div>

          {/* COURSE INTEGRATED CREATOR/EDIT FORM */}
          {(showCourseForm || editingCourseId) && (
            <form onSubmit={handleSaveCourse} className="bg-white border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 flex flex-col" id="form-course-admin">
              <h3 className="text-base font-extrabold text-slate-800 pb-2.5 border-b border-slate-100 flex items-center gap-1.5">
                <PlusCircle className="h-5 w-5 text-orange-600" />
                <span>{editingCourseId ? 'แก้ไขข้อมูลหลักสูตรอบรมชำนาญการ' : 'สร้างหลักสูตรอบรมใหม่'}</span>
              </h3>

              {/* Grid Inputs for Course Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">ชื่อหลักสูตรอบรม (Course Title) *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น AI in Higher Education Workshop"
                    value={courseForm.title || ''}
                    onChange={(e) => setCourseForm({...courseForm, title: e.target.value})}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">วิทยากรเดี่ยว/คณะผู้บรรยาย (Speaker) *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ดร. สมชาย รักดี"
                    value={courseForm.speaker || ''}
                    onChange={(e) => setCourseForm({...courseForm, speaker: e.target.value})}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">วันที่จัดโครงการ (Date) *</label>
                  <input
                    type="date"
                    required
                    value={courseForm.date || ''}
                    onChange={(e) => setCourseForm({...courseForm, date: e.target.value})}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">เวลาจัดสัมมนา (Time) *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น 13:00 - 16:00"
                    value={courseForm.time || ''}
                    onChange={(e) => setCourseForm({...courseForm, time: e.target.value})}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">สถานที่อบรมสัมมนา (Location) *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ห้องปทุมวัน หรือ Online Zoom"
                    value={courseForm.location || ''}
                    onChange={(e) => setCourseForm({...courseForm, location: e.target.value})}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5 font-sans">
                  <label className="text-xs font-bold text-slate-600 block">ลิงก์โปสเตอร์/รูปภาพประกอบ (Poster URL / Image Upload)</label>
                  <div className="flex flex-col gap-2 bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="วางลิงก์รูปภาพ หรือ อัปโหลดไฟล์รูปภาพด้านขวา"
                          value={courseForm.posterUrl?.startsWith('data:image/') ? '[รูปภาพที่อัปโหลดเข้าสู่คลาวด์แล้ว]' : (courseForm.posterUrl || '')}
                          disabled={courseForm.posterUrl?.startsWith('data:image/')}
                          onChange={(e) => setCourseForm({...courseForm, posterUrl: e.target.value})}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePosterUpload}
                          className="hidden"
                          id="file-poster-upload"
                        />
                        <label
                          htmlFor="file-poster-upload"
                          className="px-3.5 h-[34px] text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 rounded-lg cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>อัปโหลดรูปภาพ</span>
                        </label>
                      </div>
                    </div>
                    
                    {courseForm.posterUrl && (
                      <div className="flex items-center gap-3 bg-white p-2 border border-slate-150 rounded-lg">
                        <div className="w-12 h-16 border rounded bg-slate-50 flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                          <img 
                            src={courseForm.posterUrl} 
                            alt="Course Poster" 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-700 truncate">
                            {courseForm.posterUrl.startsWith('data:image/') ? 'รูปภาพอัปโหลด (Base64 JPEG)' : courseForm.posterUrl}
                          </p>
                          <p className="text-[9px] text-slate-400">
                            {courseForm.posterUrl.startsWith('data:image/') ? 'บีบอัดเรียบร้อยเเล้วเพื่อประหยัดพื้นที่คลาวด์' : 'ลิงก์รูปภาพภายนอก'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCourseForm({...courseForm, posterUrl: ''})}
                          className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded cursor-pointer"
                        >
                          ลบรูปภาพ
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">วันเวลาที่ปิดลงทะเบียนสิทธิ์ (Registration Close Time)</label>
                  <input
                    type="datetime-local"
                    value={courseForm.registrationCloseTime || ''}
                    onChange={(e) => setCourseForm({...courseForm, registrationCloseTime: e.target.value})}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5 font-sans">
                  <label className="text-xs font-bold text-slate-600 block">จำกัดจำนวนผู้ลงทะเบียน (Seat / Registration Limit)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="เช่น 50 (ใส่ 0 หรือเว้นว่างหากไม่จำกัดจำนวนที่นั่ง)"
                    value={courseForm.maxSeats === undefined ? '' : courseForm.maxSeats}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                      setCourseForm({...courseForm, maxSeats: val});
                    }}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5 font-sans">
                  <label className="text-xs font-bold text-slate-600 block">การเปิดแสดงผลโครงการ (Course Visibility)</label>
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 h-[38px] rounded-lg">
                    <input
                      type="checkbox"
                      id="course-visibility"
                      checked={courseForm.visible !== false}
                      onChange={(e) => setCourseForm({...courseForm, visible: e.target.checked})}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4.5 w-4.5 cursor-pointer"
                    />
                    <label htmlFor="course-visibility" className="text-xs text-slate-700 font-bold cursor-pointer select-none">
                      {courseForm.visible !== false ? '🟢 เปิดแสดงโครงการบนหน้าเว็บ' : '⚪ ซ่อนโครงการนี้ชั่วคราว'}
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5 font-sans">
                  <label className="text-xs font-bold text-slate-600 block">การจัดเก็บหลักสูตรที่อบรมเสร็จสิ้น (Archive Course)</label>
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 h-[38px] rounded-lg">
                    <input
                      type="checkbox"
                      id="course-archived"
                      checked={courseForm.archived === true}
                      onChange={(e) => setCourseForm({...courseForm, archived: e.target.checked})}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4.5 w-4.5 cursor-pointer"
                    />
                    <label htmlFor="course-archived" className="text-xs text-slate-700 font-bold cursor-pointer select-none">
                      {courseForm.archived === true ? '📦 จัดเก็บแล้ว (เก็บประวัติเพื่อดูย้อนหลัง)' : '🚀 เปิดดำเนินการอยู่ (Active)'}
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5 font-sans col-span-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-600 block">ข้อกำหนดสิทธิ์ผู้ลงทะเบียนเรียน (Registration Eligibility Rule)</label>
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-3 h-[38px] rounded-lg">
                    <input
                      type="checkbox"
                      id="course-restrict-to-targets"
                      checked={courseForm.restrictToTargets === true}
                      onChange={(e) => setCourseForm({...courseForm, restrictToTargets: e.target.checked})}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4.5 w-4.5 cursor-pointer"
                    />
                    <label htmlFor="course-restrict-to-targets" className="text-xs text-slate-700 font-bold cursor-pointer select-none">
                      {courseForm.restrictToTargets === true 
                        ? '🔒 จำกัดสิทธิ์เฉพาะกลุ่มเป้าหมายที่เลือกเท่านั้น (เฉพาะผู้มีตำแหน่งงานหรือรายชื่อบุคลากรเป้าหมาย)' 
                        : '🔓 เปิดสาธารณะลงได้ทุกคน (ไม่จำกัดเฉพาะผู้ส่งเมลแจ้ง/รายชื่อที่เลือกไว้)'}
                    </label>
                  </div>
                </div>
              </div>

              {/* Target Position Selector Container */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 font-sans">
                <label className="text-xs font-bold text-slate-600 block">กำหนดคุณลักษณะสิทธิ์เฉพาะ / คัดกรองเป้าหมายผู้เข้าร่วม *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1 font-sans">
                  {PREDEFINED_POSITIONS.map((pos) => {
                    const isChecked = (courseForm.targetPositions || []).includes(pos);
                    const personnelCount = personnel.filter(p => matchPosition(p.position || '', pos)).length;

                    return (
                      <label
                        key={pos}
                        className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition cursor-pointer select-none ${
                          isChecked
                            ? 'bg-orange-50/50 border-orange-300 text-orange-950 shadow-2xs'
                            : 'bg-white border-slate-150 hover:bg-slate-50 text-slate-650'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleTargetPosition(pos)}
                            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4"
                          />
                          <span>{pos}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${isChecked ? 'bg-orange-100 text-orange-850' : 'bg-slate-200 text-slate-500'}`}>
                          {personnelCount} คน
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Custom Input Adding */}
                <div className="flex gap-2 pt-1 border-t border-slate-100/60 items-center font-sans">
                  <input
                    type="text"
                    placeholder="พิมพ์ตำแหน่งงานอื่น..."
                    value={customTargetPosition}
                    onChange={(e) => setCustomTargetPosition(e.target.value)}
                    className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTargetPosition}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition text-xs"
                  >
                    เพิ่มตำแหน่งกำหนดเอง
                  </button>
                </div>

                {/* Highlight selected chips */}
                {(courseForm.targetPositions || []).length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 items-center font-sans">
                    <span className="text-[10px] uppercase font-bold text-slate-400">ตำแหน่งที่กำหนดสิทธิ์ลงทะเบียนได้ขณะนี้:</span>
                    {(courseForm.targetPositions || []).map(p => (
                      <span key={p} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-orange-100 text-orange-800 border border-orange-200 rounded-full text-[10px] font-bold">
                        <span>{p}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleTargetPosition(p)}
                          className="text-orange-600 hover:text-orange-955 font-bold focus:outline-none font-sans"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 👥 Specific Personnel Selection */}
                <div className="space-y-2 pt-3 border-t border-slate-150/65 font-sans">
                  <label className="text-xs font-bold text-slate-600 block flex items-center gap-1.5">
                    <span>👥 กำหนดรายชื่อบุคคลอบรมผ่านเกณฑ์ / ได้รับสิทธิ์ลงทะเบียนเฉพาะบุคคล (เจาะจงเฉพาะรายชื่อ)</span>
                  </label>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อ รหัสพนักงาน แผนก หรืออีเมล เพื่อเลือกเฉพาะบุคคล..."
                      value={personnelSearchForTarget}
                      onChange={(e) => setPersonnelSearchForTarget(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                    {personnelSearchForTarget && (
                      <button
                        type="button"
                        onClick={() => setPersonnelSearchForTarget('')}
                        className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        ล้างคำค้น
                      </button>
                    )}
                  </div>

                  {/* Search Results Dropdown List */}
                  {personnelSearchForTarget.trim().length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-slate-200 bg-white rounded-lg divide-y divide-slate-100 shadow-sm">
                      {(() => {
                        const query = personnelSearchForTarget.toLowerCase().trim();
                        const filtered = personnel.filter(p => 
                          p.name.toLowerCase().includes(query) ||
                          p.id.toLowerCase().includes(query) ||
                          p.department.toLowerCase().includes(query) ||
                          p.email.toLowerCase().includes(query) ||
                          (p.position && p.position.toLowerCase().includes(query))
                        );

                        if (filtered.length === 0) {
                          return <div className="p-3 text-center text-xs text-slate-400 font-medium">ไม่พบข้อมูลบุคลากรที่ค้นหา</div>;
                        }

                        return filtered.map(p => {
                          const isAlreadyAdded = (courseForm.targetPersonnelIds || []).includes(p.id);
                          return (
                            <div key={p.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50 text-xs font-sans">
                              <div>
                                <p className="font-bold text-slate-800">{p.name} <span className="text-slate-400 font-normal">({p.id})</span></p>
                                <p className="text-[10px] text-slate-500">{p.position} • {p.department}</p>
                              </div>
                              {isAlreadyAdded ? (
                                <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-md font-bold">เพิ่มแล้ว</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddTargetPersonnel(p.id)}
                                  className="px-2.5 py-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg text-[10px] transition cursor-pointer"
                                >
                                  + เพิ่มรายชื่อ
                                </button>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}

                  {/* Selected Specific Personnel Chips */}
                  {(courseForm.targetPersonnelIds || []).length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 font-sans">
                      <div className="flex justify-between items-center pb-1.5 border-b border-slate-200">
                        <span className="text-[10px] uppercase font-extrabold text-slate-500">รายชื่อบุคคลที่กำหนดสิทธิ์เฉพาะ ({courseForm.targetPersonnelIds?.length} ท่าน):</span>
                        <button
                          type="button"
                          onClick={() => setCourseForm(prev => ({ ...prev, targetPersonnelIds: [] }))}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          ล้างรายชื่อทั้งหมด
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pt-1">
                        {courseForm.targetPersonnelIds?.map(id => {
                          const p = personnel.find(x => x.id === id);
                          return (
                            <div key={id} className="flex items-center justify-between bg-white border border-slate-150 px-2.5 py-1 rounded-lg text-xs shadow-3xs">
                              <div className="min-w-0 pr-2">
                                <p className="font-bold text-slate-800 truncate">{p ? p.name : 'ไม่พบรายชื่อในระบบ'}</p>
                                <p className="text-[9px] text-slate-400 font-medium truncate">{id} {p ? `• ${p.position}` : ''}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveTargetPersonnel(id)}
                                className="text-slate-400 hover:text-rose-600 font-bold p-0.5 cursor-pointer transition text-sm"
                                title="นำชื่อออก"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>



              {/* Save/Cancel Buttons */}
              <div className="flex gap-2 pt-3 border-t border-slate-100 font-sans justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCourseForm(false);
                    setEditingCourseId(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-705 text-xs font-bold rounded-xl transition duration-150"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-sm transition duration-150"
                >
                  {editingCourseId ? 'อัปเดตหลักสูตร' : 'บันทึกการสร้าง'}
                </button>
              </div>
            </form>
          )}

          {/* COURSES LIST SECTION */}
          {!showCourseForm && !editingCourseId && (
            <div className="space-y-6" id="courses-list-section">
              {/* Filter tabs */}
              <div className="flex flex-wrap border-b border-slate-100 pb-1.5 gap-2" id="admin-courses-filter-tabs">
                <button
                  type="button"
                  onClick={() => setCourseFilter('active')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                    courseFilter === 'active'
                      ? 'bg-orange-50 border-orange-200 text-orange-750 font-extrabold shadow-3xs'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>🚀 เปิดดำเนินการอยู่ (Active)</span>
                  <span className="bg-orange-100 text-orange-850 px-1.5 py-0.5 rounded-full text-[10px]">
                    {courses.filter(c => !c.archived).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCourseFilter('archived')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                    courseFilter === 'archived'
                      ? 'bg-slate-100 border-slate-300 text-slate-750 font-extrabold shadow-3xs'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>📦 จัดเก็บแล้ว (Archived)</span>
                  <span className="bg-slate-200 text-slate-750 px-1.5 py-0.5 rounded-full text-[10px]">
                    {courses.filter(c => c.archived).length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCourseFilter('all')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg border transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                    courseFilter === 'all'
                      ? 'bg-slate-150 border-slate-300 text-slate-800 font-extrabold shadow-3xs'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>🌐 ทั้งหมด (All)</span>
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-[10px]">
                    {courses.length}
                  </span>
                </button>
              </div>

              {filteredCoursesForAdmin.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 text-slate-400 text-xs font-sans shadow-sm">
                  {courseFilter === 'active' 
                    ? 'ไม่พบหลักสูตรปกติที่กำลังดำเนินการอบรมขณะนี้ค่ะ' 
                    : courseFilter === 'archived'
                    ? 'ไม่พบหลักสูตรที่จัดเก็บไว้ในสารบบขณะนี้ค่ะ'
                    : 'ไม่พบหลักสูตรอบรมชำนาญการใดในระบบความปลอดภัยขณะนี้ กรุณากด "สร้างหลักสูตรอบรมใหม่" ค่ะ'}
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredCoursesForAdmin.map(course => {
                    const isExpanded = expandedCourseId === course.id;
                    const matchedRegs = registrations.filter(r => r.courseId === course.id);
                    const registeredLength = matchedRegs.length;
                    const checkedInLength = matchedRegs.filter(r => r.checkedIn).length;
                    const filteredParticipants = matchedRegs.filter(reg => {
                      const p = personnel.find(x => (reg.personnelId && x.id === reg.personnelId) || (reg.email && x.email && x.email.toLowerCase() === reg.email.toLowerCase()));
                      const name = p?.name || reg.name || '';
                      const email = p?.email || reg.email || '';
                      const id = p?.id || reg.personnelId || '';
                      const dept = p?.department || reg.department || '';
                      const pos = p?.position || reg.position || '';
                      const term = participantSearchTerm.toLowerCase();
                      return (
                        name.toLowerCase().includes(term) ||
                        email.toLowerCase().includes(term) ||
                        id.toLowerCase().includes(term) ||
                        pos.toLowerCase().includes(term) ||
                        dept.toLowerCase().includes(term)
                      );
                    });

                    // Compute invitation target list
                    const targetList = personnel.filter(p => {
                      const posMatch = (course.targetPositions || []).includes(p.position);
                      const idMatch = (course.targetPersonnelIds || []).includes(p.id);
                      return posMatch || idMatch;
                    });
                    const registeredTargetsCount = targetList.filter(p =>
                      registrations.some(r => r.courseId === course.id && (r.email.toLowerCase() === p.email.toLowerCase() || r.personnelId === p.id))
                    ).length;
                    const filteredTargetList = targetList.filter(p =>
                      p.name.toLowerCase().includes(participantSearchTerm.toLowerCase()) ||
                      p.id.includes(participantSearchTerm) ||
                      p.department.toLowerCase().includes(participantSearchTerm.toLowerCase())
                    );

                    return (
                      <div key={course.id} className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-xs flex flex-col gap-4 font-sans animate-in fade-in duration-150" id={`course-card-${course.id}`}>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="flex items-start gap-4 flex-1">
                            {course.posterUrl && (
                              <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 shadow-xs relative">
                                <img 
                                  src={course.posterUrl} 
                                  alt={course.title} 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            )}
                            <div className="space-y-1 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 font-bold bg-orange-100 text-orange-850 rounded-full border border-orange-200 flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                <span>จัดเมื่อ: {course.date}</span>
                              </span>
                              <span className="text-[10px] px-2 py-0.5 font-bold bg-slate-100 text-slate-700 rounded-full border border-slate-200 flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                <span>เวลา {course.time} น.</span>
                              </span>
                              {course.registrationCloseTime && (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-rose-50 text-rose-700 rounded-full border border-rose-100 flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>ปิดเปิดจอง: {new Date(course.registrationCloseTime).toLocaleString('th-TH')}</span>
                                </span>
                              )}
                              {course.visible !== false ? (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200 flex items-center gap-0.5">
                                  <Eye className="w-3 h-3 text-emerald-600" />
                                  <span>เปิดแสดงผลทั่วไป (Visible)</span>
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-slate-100 text-slate-500 rounded-full border border-slate-200 flex items-center gap-0.5">
                                  <EyeOff className="w-3 h-3 text-slate-400" />
                                  <span>ซ่อนโครงการ (Hidden)</span>
                                </span>
                              )}
                              {course.archived === true && (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-amber-50 text-amber-800 rounded-full border border-amber-200 flex items-center gap-0.5">
                                  <Archive className="w-3 h-3 text-amber-600" />
                                  <span>จัดเก็บแล้ว (Archived)</span>
                                </span>
                              )}
                              {course.maxSeats ? (
                                <span className={`text-[10px] px-2 py-0.5 font-bold rounded-full border flex items-center gap-0.5 ${
                                  registeredLength >= course.maxSeats
                                    ? 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}>
                                  <Users className="w-3 h-3 text-amber-600" />
                                  <span>จำกัด: {registeredLength} / {course.maxSeats} ที่นั่ง {registeredLength >= course.maxSeats ? '(เต็มแล้ว)' : ''}</span>
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-slate-50 text-slate-600 rounded-full border border-slate-155 flex items-center gap-0.5">
                                  <Users className="w-3 h-3 text-slate-400" />
                                  <span>ที่นั่ง: {registeredLength} (ไม่จำกัด)</span>
                                </span>
                              )}
                              {course.restrictToTargets === true ? (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-purple-50 text-purple-800 rounded-full border border-purple-200 flex items-center gap-0.5" title="เฉพาะผู้ตรงตามตำแหน่งหรือรายชื่อที่เลือกไว้เท่านั้น">
                                  <Shield className="w-3 h-3 text-purple-600" />
                                  <span>🔒 จำกัดกลุ่มเป้าหมายเท่านั้น</span>
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 font-bold bg-sky-50 text-sky-850 rounded-full border border-sky-200 flex items-center gap-0.5" title="บุคคลทั่วไปและบุคลากรทุกคนสามารถลงทะเบียนได้">
                                  <Globe className="w-3 h-3 text-sky-600" />
                                  <span>🔓 เปิดสาธารณะลงได้ทุกคน</span>
                                </span>
                              )}
                            </div>
                            
                            <h3 className="font-extrabold text-slate-900 text-sm md:text-base mt-2" id={`card-title-${course.id}`}>{course.title}</h3>
                            <p className="text-xs text-slate-500 font-medium">วิทยากรวิพากย์: 👨‍🏫 <strong>{course.speaker}</strong> • ห้องจัดงานหลัก: 📍 {course.location}</p>
                            
                            {/* Display specific targets or target badge */}
                            {course.targetPositions && course.targetPositions.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">กลุ่มเป้าหมายสายงาน:</span>
                                {course.targetPositions.map(pos => (
                                  <span key={pos} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                    {pos}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">กลุ่มเป้าหมายสายงาน:</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  ทุกตำแหน่งงานตามฐานสิทธิ์
                                </span>
                              </div>
                            )}

                            {course.targetPersonnelIds && course.targetPersonnelIds.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 font-sans">
                                <span className="text-[10px] uppercase font-bold text-slate-400">รายชื่อบุคคลที่มีสิทธิ์เพิ่มเติม ({course.targetPersonnelIds.length} ท่าน)</span>
                              </div>
                            )}

                            <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-200 flex justify-between items-center mt-4">
                              <span>พิกัดเช็คอินหน้างานตรวจสอบความปลอดภัย</span>
                              <a 
                                href={`${getCleanOrigin()}/?courseId=${course.id}&action=checkin`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-655 font-extrabold hover:underline"
                              >
                                เปิดหน้าระบบเช็คอินในแท็ปใหม่ ↗
                              </a>
                            </div>
                          </div>
                        </div>

                          {/* Course Action Buttons */}
                          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch gap-2.5 w-full md:w-auto self-stretch md:self-auto justify-end border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                            <button
                              onClick={() => handleToggleVisibility(course)}
                              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs border ${
                                course.visible !== false
                                  ? 'bg-slate-50 border-slate-250 text-slate-700 hover:bg-slate-100 hover:border-slate-350 hover:text-slate-900'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              id={`btn-toggle-visibility-${course.id}`}
                              title={course.visible !== false ? "ซ่อนโครงการ" : "แสดงโครงการ"}
                            >
                              {course.visible !== false ? <EyeOff className="h-4 w-4 text-slate-500" /> : <Eye className="h-4 w-4 text-emerald-600" />}
                              <span>{course.visible !== false ? 'ซ่อนโครงการ' : 'เปิดแสดงผล'}</span>
                            </button>
                            <button
                              onClick={() => handleToggleArchive(course)}
                              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs border ${
                                course.archived === true
                                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                                  : 'bg-slate-50 border-slate-250 text-slate-700 hover:bg-slate-100'
                              }`}
                              id={`btn-toggle-archive-${course.id}`}
                              title={course.archived === true ? "เลิกจัดเก็บโครงการ" : "จัดเก็บโครงการ"}
                            >
                              <Archive className={`h-4 w-4 ${course.archived === true ? 'text-amber-600' : 'text-slate-500'}`} />
                              <span>{course.archived === true ? 'เลิกจัดเก็บ (Restore)' : 'จัดเก็บ (Archive)'}</span>
                            </button>
                            <button
                              onClick={() => handleEditCourse(course)}
                              className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-250 hover:bg-slate-100 hover:border-slate-350 hover:text-slate-900 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                              id={`btn-edit-course-${course.id}`}
                            >
                              <Edit className="h-4 w-4 text-orange-600" />
                              <span>แก้ไขรายละเอียด</span>
                            </button>
                            <button
                              onClick={() => handleDeleteCourse(course.id)}
                              className="px-4 py-2.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-150 hover:bg-rose-100 hover:border-rose-250 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                              id={`btn-delete-course-${course.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                              <span>ลบหลักสูตร</span>
                            </button>
                          </div>
                        </div>

                        {/* SUBTAB 2: PARTICIPANT REGISTERED LIST & STATUS */}
                        {activeCourseSubTab === 'attendees' && (
                          <div className="space-y-4 animate-in fade-in duration-200" id="subtab-attendees">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                              <div>
                                <h4 className="font-extrabold text-slate-805 text-sm flex items-center gap-1.5">
                                  <Users className="h-4 w-4 text-orange-600" />
                                  <span>รายชื่อผู้เข้าเรียนในหลักสูตรสำเร็จ ({registeredLength}{course.maxSeats ? ` / ${course.maxSeats}` : ''} คน)</span>
                                </h4>
                                <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                                  ยืนยันการเช็คอินสแกนเรียบร้อย <strong className="text-emerald-600">{checkedInLength}</strong> คน • ยังไม่เช็คอิน <strong className="text-blue-600">{registeredLength - checkedInLength}</strong> คน
                                </p>
                              </div>
                              
                              <div className="flex items-center gap-2 w-full sm:w-auto font-sans">
                                <input
                                  type="text"
                                  placeholder="ค้นหาชื่อ / รหัสในคอร์สนี้..."
                                  value={participantSearchTerm}
                                  onChange={(e) => setParticipantSearchTerm(e.target.value)}
                                  className="bg-white border border-slate-205 text-xs px-3 h-10 rounded-xl max-w-xs focus:outline-none focus:border-orange-500 flex-1 min-w-[200px] shadow-3xs font-semibold"
                                />
                              </div>
                            </div>

                            {/* Retroactive Key-In Form */}
                            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 space-y-4 font-sans">
                              <div>
                                <h5 className="text-xs font-extrabold text-amber-800 flex items-center gap-1">
                                  <Plus className="h-4 w-4 text-amber-700" />
                                  <span>ป้อนข้อมูลผู้เข้าอบรมย้อนหลัง (Key in Retroactive Attendee)</span>
                                </h5>
                                <p className="text-[11px] text-amber-700/85 mt-0.5">เลือกรายชื่ออาจารย์/บุคลากรที่มีในระบบเพื่อดึงข้อมูลอย่างรวดเร็ว หรือคีย์ป้อนข้อมูลบุคลากรใหม่ภายนอกตรงๆ ได้ทันที</p>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 block">ดึงประวัติบุคลากรที่มีอยู่</label>
                                  <select
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val) {
                                        const found = personnel.find(p => p.id === val);
                                        if (found) {
                                          setRetroForm({
                                            personnelId: found.id,
                                            name: found.name,
                                            email: found.email,
                                            department: found.department,
                                            checkedIn: true
                                          });
                                        }
                                      } else {
                                        setRetroForm({ personnelId: '', name: '', email: '', department: '', checkedIn: true });
                                      }
                                    }}
                                    value={retroForm.personnelId || ''}
                                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-705 focus:outline-none focus:border-amber-500 min-h-[38px] font-bold"
                                  >
                                    <option value="">-- เลือกจากฐานรายชื่อที่มี --</option>
                                    {personnel.map(p => (
                                      <option key={p.id} value={p.id}>{p.id} - {p.name} ({p.department})</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 block">รหัสบุคลากร *</label>
                                  <input
                                    type="text"
                                    placeholder="รหัสพนักงาน เช่น 10502011"
                                    value={retroForm.personnelId || ''}
                                    onChange={(e) => setRetroForm({...retroForm, personnelId: e.target.value})}
                                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-505 min-h-[38px]"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 block">ชื่อ-นามสกุลจริง *</label>
                                  <input
                                    type="text"
                                    placeholder="ชื่อ นามสกุลจริง"
                                    value={retroForm.name || ''}
                                    onChange={(e) => setRetroForm({...retroForm, name: e.target.value})}
                                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-505 min-h-[38px]"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 block">อีเมลวิทยาเขต (@bu.ac.th) *</label>
                                  <input
                                    type="email"
                                    placeholder="somchai.t@bu.ac.th"
                                    value={retroForm.email || ''}
                                    onChange={(e) => setRetroForm({...retroForm, email: e.target.value})}
                                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-505 min-h-[38px]"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 block">หน่วยงาน / สังกัด *</label>
                                  <input
                                    type="text"
                                    placeholder="สำนักงานพัฒนาระบบสหกิจฯ"
                                    value={retroForm.department || ''}
                                    onChange={(e) => setRetroForm({...retroForm, department: e.target.value})}
                                    className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-amber-505 min-h-[38px]"
                                  />
                                </div>

                                <div className="flex flex-col justify-end space-y-2">
                                  <div className="flex items-center gap-1.5 py-1">
                                    <input
                                      type="checkbox"
                                      id={`retro-checked-${course.id}`}
                                      checked={retroForm.checkedIn}
                                      onChange={(e) => setRetroForm({...retroForm, checkedIn: e.target.checked})}
                                      className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4 shadow-sm cursor-pointer"
                                    />
                                    <label htmlFor={`retro-checked-${course.id}`} className="text-xs font-bold text-slate-705 cursor-pointer select-none">
                                      ผ่านการเช็คอินเข้าอบรมเรียบร้อยแล้ว
                                    </label>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddRetroAttendee(course)}
                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 min-h-[38px] shadow-sm ml-auto"
                                  >
                                    <Check className="h-4 w-4" />
                                    <span>คีย์ป้อนประวัติผู้เข้าร่วม</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Participant Table */}
                            {filteredParticipants.length === 0 ? (
                              <div className="text-center py-8 text-slate-450 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                                ยังไม่มีรายชื่อผู้ลงทะเบียน/ผู้เข้าอบรมในโครงการจัดสรรนี้ที่ตรงกับหน่วยข้อมูลค้นหา
                              </div>
                            ) : (
                              <div className="overflow-x-auto border border-slate-150 rounded-2xl bg-white shadow-3xs font-sans">
                                <table className="w-full border-collapse text-left text-xs text-slate-600">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-150 text-slate-505 font-bold">
                                      <th className="p-3 pl-4">รหัสบุคลากร</th>
                                      <th className="p-3">ชื่อ - นามสกุล</th>
                                      <th className="p-3">ตำแหน่ง</th>
                                      <th className="p-3">อีเมลติดต่อ</th>
                                      <th className="p-3">หน่วยงาน/สังกัด</th>
                                      <th className="p-3 text-orange-700">หลักสูตร</th>
                                      <th className="p-3 text-center">สถานะการเช็คอิน</th>
                                      <th className="p-3 text-right pr-4">การจัดการรายละเอียด</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {filteredParticipants.map(participant => {
                                      const p = personnel.find(x => (participant.personnelId && x.id === participant.personnelId) || (participant.email && x.email && x.email.toLowerCase() === participant.email.toLowerCase()));
                                      const displayId = p?.id || participant.personnelId || '-';
                                      const displayName = p?.name || participant.name || '-';
                                      const displayPosition = p?.position || participant.position || '-';
                                      const displayEmail = p?.email || participant.email || '-';
                                      const displayDept = p?.department || participant.department || '-';
                                      const displayCurriculum = getDisplayCurriculum(p?.curriculum, displayDept);

                                      return (
                                        <tr key={participant.id} className="hover:bg-slate-50/55 transition">
                                          <td className="p-3 pl-4 font-bold text-slate-800 font-mono">{displayId}</td>
                                          <td className="p-3 font-extrabold text-slate-900">{displayName}</td>
                                          <td className="p-3 text-slate-600 font-medium">{displayPosition}</td>
                                          <td className="p-3 text-slate-505 font-mono">{displayEmail}</td>
                                          <td className="p-3 text-slate-505 font-semibold">{displayDept}</td>
                                          <td className="p-3 font-medium text-orange-700">
                                            <span className="bg-orange-50 border border-orange-100/55 rounded-md px-2.5 py-1 inline-block max-w-[280px] whitespace-normal break-words leading-normal text-[11px]" title={displayCurriculum}>
                                              {displayCurriculum}
                                            </span>
                                          </td>
                                        <td className="p-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleToggleCheckInManual(participant)}
                                            className={`px-3 py-1 rounded-full font-bold text-[10px] transition shadow-3xs border ${
                                              participant.checkedIn
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100'
                                                : 'bg-amber-50 text-amber-700 border-amber-250 hover:bg-amber-100'
                                            }`}
                                          >
                                            {participant.checkedIn ? '✅ ผ่านการอบรม (เช็คอินแล้ว)' : '⏳ ยังไม่สมบูรณ์ (รอหน้างาน)'}
                                          </button>
                                        </td>
                                        <td className="p-3 text-right pr-4">
                                          <div className="flex gap-2 justify-end">
                                            <button
                                              type="button"
                                              onClick={() => handleStartEditRegistration(participant)}
                                              className="p-1 px-2.5 bg-amber-50 border border-amber-100 text-amber-600 hover:bg-amber-100/50 rounded text-[10px] font-bold cursor-pointer"
                                            >
                                              แก้ไข
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteRegistrationManual(participant, course)}
                                              className="p-1 px-2.5 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100/50 rounded text-[10px] font-bold cursor-pointer"
                                            >
                                              ลบ
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* SUBTAB 3: TRAINING EMAIL REMINDER CAMPAIGN */}
                        {activeCourseSubTab === 'reminder' && (
                          <div className="bg-slate-50 border border-slate-205 p-6 rounded-3xl space-y-4 animate-in fade-in duration-200 font-sans" id="subtab-reminder-email">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                                  <Mail className="h-5 w-5 text-orange-600 animate-pulse" />
                                  <span>ระบบกำหนดข้อความแจ้งข่าวและแจ้งเตือนการอบรมกลุ่ม</span>
                                </h4>
                                <p className="text-xs text-slate-500 mt-1">เจ้าหน้าที่สามารถกดจัดส่งแผนการแจ้งเตือนเตือนหลักสูตรการจัดโครงการ ไปหาผู้ลงทะเบียนเพื่อเตือนสติการเข้าห้องเรียน</p>
                              </div>
                              <span className="text-[11px] font-bold bg-orange-100 text-orange-850 px-3 py-1 rounded-full shadow-3xs">
                                ผู้สมัครอบรม: {registeredLength} คน
                              </span>
                            </div>

                            <div className="space-y-4">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 block">หัวหน้าเรื่องข้อความ (Email Subject)</label>
                                <input
                                  type="text"
                                  value={courseReminderSubject}
                                  onChange={(e) => setCourseReminderSubject(e.target.value)}
                                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500 min-h-[38px]"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 block">เนื้อหารายละเอียดเนื้อความหลัก (Email Message Body)</label>
                                <textarea
                                  rows={8}
                                  value={courseReminderMessage}
                                  onChange={(e) => setCourseReminderMessage(e.target.value)}
                                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500 leading-relaxed font-semibold"
                                  placeholder="เขียนกำหนดการสัมมนาที่จะแจ้งให้ผู้เข้าอบรมรับทราบที่นี่..."
                                />
                                <ImageToHtmlHelper onInsert={(htmlImg) => setCourseReminderMessage(prev => prev + "\n" + htmlImg + "\n")} />
                                <div className="mt-1 bg-orange-50/50 border border-orange-100 p-3 rounded-xl text-[11px] text-slate-600 space-y-1">
                                  <p className="font-bold text-slate-700 flex items-center gap-1">✨ เคล็ดลับการแต่งข้อความและแทรกรูปภาพ:</p>
                                  <p className="pl-4">• <strong>ตัวแปรอัตโนมัติ:</strong> <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{course_title}`}</code>, <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{date_time}`}</code>, <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{location}`}</code>, <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{speaker}`}</code>, <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{register_link}`}</code></p>
                                  <p className="pl-4">• <strong>🖼️ แทรกรูปโปสเตอร์คอร์สอัตโนมัติ:</strong> พิมพ์ <code className="text-blue-600 bg-white px-1.5 py-0.5 rounded font-mono font-extrabold">{`{course_poster}`}</code> ในตำแหน่งที่ต้องการวางรูปภาพของคอร์สนี้</p>
                                  <p className="pl-4">• <strong>🔗 ดึงรูปจากภายนอกด้วย HTML:</strong> พิมพ์ <code className="text-slate-700 bg-white px-1.5 py-0.5 rounded font-mono">{`<img src="ใส่ลิงก์รูปภาพที่นี่" style="max-width:100%; border-radius:8px;"/>`}</code></p>
                                </div>
                              </div>

                              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                                <span className="text-[10px] text-slate-400">
                                  💡 จดหมายข่าวสารนี้ จะกระจายไปยังอีเมลที่เชื่อมโยงกับโครงการทั้งสิ้น {registeredLength} ท่าน
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (registeredLength === 0) {
                                      alert('ไม่สามารถกระจายฉนวนสารได้ เนื่องจากยังไม่มีนักศึกษาหรืออาจารย์ผู้จองสิทธิ์ประสงค์เข้าลงเรียนวิชานี้ค่ะ');
                                      return;
                                    }
                                    if (!courseReminderSubject.trim() || !courseReminderMessage.trim()) {
                                      alert('กรุณากรอกหัวข้อและกำหนดการรายละเอียดเพื่อจัดส่งค่ะ');
                                      return;
                                    }
                                    setSendingBulkEmail(true);
                                    try {
                                      const registeredEmails = matchedRegs.map(r => r.email);
                                      if (gasUrl) {
                                        const gasRes = await sendGasWebhook(gasUrl, {
                                          action: 'bulk',
                                          emails: registeredEmails,
                                          courseTitle: course.title,
                                          messageText: `[จดหมายข่าวแจ้งเตือนกำหนดเกณฑ์การเข้าเรียน]\n\n${courseReminderMessage}`
                                        });
                                        const actualSuccess = typeof gasRes.count === 'number' ? gasRes.count : (registeredEmails.length - (gasRes.failedCount || 0));
                                        const failedCount = gasRes.failedCount || 0;
                                        if (failedCount > 0) {
                                          alert(`⚠️ ผลการจัดส่งจดหมายเตือน (Bulk):\n• ส่งสำเร็จ: ${actualSuccess} ท่าน\n• ส่งล้มเหลว: ${failedCount} ท่าน\n${gasRes.failedEmails?.length ? `รายชื่อเมลที่ขัดข้อง: ${gasRes.failedEmails.join(', ')}\n` : ''}โปรดตรวจสอบโควต้าอีเมลของบัญชีผู้ส่งค่ะ`);
                                        } else {
                                          alert(`🎉 [ส่งจริงสำเร็จ] ดำเนินการจัดส่งจดหมายแจ้งข่าวสารสัมพันธ์ไปยังรายชื่อผู้รับจำนวน ${actualSuccess} ท่าน สำเร็จเรียบร้อยแล้วค่ะ!`);
                                        }
                                      } else {
                                        console.warn(`--- SEND BULK EMAIL TO ${registeredEmails.length} RECIPIENTS ---`, courseReminderMessage);
                                        alert(`[แอดมินระบบจำลอง] บรอดแคสต์จดหมายเตือนเข้าเรียนไปยัง ${registeredEmails.length} บัญชีผู้ใช้เรียนสำนักงานสำเร็จ!`);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      alert('❌ ส่งจดหมายเตือนแบบกลุ่มไม่สำเร็จ:\n' + (err instanceof Error ? err.message : String(err)));
                                    } finally {
                                      setSendingBulkEmail(false);
                                    }
                                  }}
                                  disabled={sendingBulkEmail || registeredLength === 0}
                                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs transition duration-150 shadow-md flex items-center gap-1.5 min-h-[38px] cursor-pointer"
                                >
                                  {sendingBulkEmail ? 'กำลังจัดส่งจดหมายเตือน...' : `✉️ เริ่มส่งจดหมายถึงผู้จองสิทธิ์ (${registeredLength} คน)`}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* SUBTAB 4: FEEDBACK SURVEY CAMPAIGN */}
                        {activeCourseSubTab === 'feedback' && (
                          <div className="bg-slate-50 border border-slate-205 p-6 rounded-3xl space-y-4 animate-in fade-in duration-200 font-sans" id="subtab-feedback-email">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                                  <Mail className="h-5 w-5 text-orange-600 animate-pulse" />
                                  <span>ระบบติดตามผลการประเมินความพึงพอใจและสถิติสะสม</span>
                                </h4>
                                <p className="text-xs text-slate-500 mt-1">ประมวลผลประเมินผลผู้ตรวจสัมภาษณ์รายหลักสูตร</p>
                              </div>
                              <span className="self-start sm:self-center text-[11px] font-bold bg-emerald-100 text-emerald-850 px-3 py-1 rounded-full shadow-3xs">
                                ผู้เช็คอินผ่านสำเร็จแล้ว: {checkedInLength} คน
                              </span>
                            </div>

                            {/* Aggregated Quick Metrics */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs">
                              <div className="text-center p-2 border-r border-slate-100 last:border-0 flex flex-col justify-center">
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">ส่งผลประเมินสุทธิ</span>
                                <span className="text-lg font-extrabold text-orange-600">{matchedRegs.filter(r => r.feedback).length} / {checkedInLength} คน</span>
                                <span className="text-[10px] text-slate-400 mt-0.5">คิดประมวลผลเป็น {checkedInLength > 0 ? Math.round((matchedRegs.filter(r => r.feedback).length / checkedInLength) * 100) : 0}%</span>
                              </div>

                              <div className="text-center p-2 border-r border-slate-100 last:border-0 flex flex-col justify-center">
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">คะแนนสะสมสุทธิ (เฉลี่ย)</span>
                                <span className="text-lg font-extrabold text-emerald-600">
                                  {(() => {
                                    const feedList = matchedRegs.filter(r => r.feedback);
                                    if (feedList.length === 0) return 'รอประเมิน';
                                    const scoreSum = feedList.reduce((acc, curr) => acc + (curr.feedback?.satisfaction || 0), 0);
                                    return `${(scoreSum / feedList.length).toFixed(2)} / 5.0`;
                                  })()}
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">จาก 5 ระดับสูงสุด</span>
                              </div>

                              <div className="text-center p-2 last:border-0 flex flex-col justify-center">
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">อัตราแนะนำจัดเพิ่มปีหน้า</span>
                                <span className="text-lg font-extrabold text-blue-600">
                                  {(() => {
                                    const feedList = matchedRegs.filter(r => r.feedback && r.feedback.recommendation);
                                    if (feedList.length === 0) return 'รอประเมิน';
                                    const satisfiedNum = feedList.filter(r => (r.feedback?.recommendation || 0) >= 4).length;
                                    return `${Math.round((satisfiedNum / feedList.length) * 100)}%`;
                                  })()}
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">พิกัดคะแนน 4-5 ดาว</span>
                              </div>
                            </div>

                            {/* Evaluation Email form */}
                            <div className="space-y-4 pt-2">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 block">หัวหน้าเรื่องอีเมลส่งแบบประเมิน (Email Subject)</label>
                                <input
                                  type="text"
                                  value={courseEvaluationSubject}
                                  onChange={(e) => setCourseEvaluationSubject(e.target.value)}
                                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500 min-h-[38px]"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 block">เนื้อจดหมายข่าวชวนประเมินความพึงพอใจการอบรม (Email Body Content)</label>
                                <textarea
                                  rows={8}
                                  value={courseEvaluationMessage}
                                  onChange={(e) => setCourseEvaluationMessage(e.target.value)}
                                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500 leading-relaxed font-semibold"
                                  placeholder="เขียนเนื้อหาขอความอนุเคราะห์ตอบประเมินที่นี่..."
                                />
                                <ImageToHtmlHelper onInsert={(htmlImg) => setCourseEvaluationMessage(prev => prev + "\n" + htmlImg + "\n")} />
                                <div className="mt-1 bg-orange-50/50 border border-orange-100 p-3 rounded-xl text-[11px] text-slate-600 space-y-1">
                                  <p className="font-bold text-slate-700 flex items-center gap-1">✨ เคล็ดลับการแต่งข้อความและแทรกรูปภาพ:</p>
                                  <p className="pl-4">• <strong>ตัวแปรอัตโนมัติ:</strong> <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{course_title}`}</code>, <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{date_time}`}</code>, <code className="text-orange-600 bg-white px-1 py-0.5 rounded font-mono font-bold">{`{survey_link}`}</code></p>
                                  <p className="pl-4">• <strong>🖼️ แทรกรูปโปสเตอร์คอร์สอัตโนมัติ:</strong> พิมพ์ <code className="text-blue-600 bg-white px-1.5 py-0.5 rounded font-mono font-extrabold">{`{course_poster}`}</code> ในตำแหน่งที่ต้องการวางรูปภาพของคอร์สนี้</p>
                                  <p className="pl-4">• <strong>🔗 ดึงรูปจากภายนอกด้วย HTML:</strong> พิมพ์ <code className="text-slate-700 bg-white px-1.5 py-0.5 rounded font-mono">{`<img src="ใส่ลิงก์รูปภาพที่นี่" style="max-width:100%; border-radius:8px;"/>`}</code></p>
                                </div>
                              </div>

                              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                                <span className="text-[10px] text-slate-400">
                                  👉 ข้อเสนอแนะความพึงพอใจนี้ จะกระจายส่งไปยัง {checkedInLength} ท่านที่บันทึกข้อมูลเข้าร่วมเช็คอินแล้วเท่านั้น
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (checkedInLength === 0) {
                                      alert('ไม่สามารถจัดส่งลิงก์แบบสอบถามประเมินได้ เนื่องจากยังไม่มีนักศึกษาหรืออาจารย์สแกนมาร์กผ่านเข้าเช็คอินห้องอบรมค่ะ');
                                      return;
                                    }
                                    if (!courseEvaluationSubject.trim() || !courseEvaluationMessage.trim()) {
                                      alert('กรุณากรอกข้อมูลหัวเรื่องและเนื้อหาคำเรียนเชิญประเมินให้เรียบร้อยก่อนส่งค่ะ');
                                      return;
                                    }
                                    setSendingBulkEmail(true);
                                    try {
                                      const checkedInEmails = matchedRegs.filter(r => r.checkedIn).map(r => r.email);
                                      if (gasUrl) {
                                        const gasRes = await sendGasWebhook(gasUrl, {
                                          action: 'bulk',
                                          emails: checkedInEmails,
                                          courseTitle: course.title,
                                          messageText: `[เรียนเชิญส่งเสียงแบบประเมินโครงการจัดสรร]\n\n${courseEvaluationMessage}`
                                        });
                                        const actualSuccess = typeof gasRes.count === 'number' ? gasRes.count : (checkedInEmails.length - (gasRes.failedCount || 0));
                                        const failedCount = gasRes.failedCount || 0;
                                        if (failedCount > 0) {
                                          alert(`⚠️ ผลการจัดส่งลิงก์แบบประเมิน (Bulk):\n• ส่งสำเร็จ: ${actualSuccess} คน\n• ส่งล้มเหลว: ${failedCount} คน\n${gasRes.failedEmails?.length ? `รายชื่อเมลที่ขัดข้อง: ${gasRes.failedEmails.join(', ')}\n` : ''}โปรดตรวจสอบโควต้าอีเมลของบัญชีผู้ส่งค่ะ`);
                                        } else {
                                          alert(`🎉 [ส่งจริงสำเร็จ] ปล่อยสัญญลักษณ์จดหมายส่งลิงก์ขอความอนุเคราะห์ให้ผู้ที่เช็คอินแล้วจำนวน ${actualSuccess} คน สำเร็จเรียบร้อยแล้วค่ะ!`);
                                        }
                                      } else {
                                        console.warn(`--- SEND SATISFACTION SURVEY LINK TO ${checkedInEmails.length} PARTICIPANTS ---`, courseEvaluationMessage);
                                        alert(`[แอดมินระบบจำลอง] ส่งคำเรียนเชิญประเมินความพึงพอใจสำเร็จ และมีลิงก์จัดสรรส่งตรงไปยังอีเมลบุคลากร ${checkedInEmails.length} ท่าน!`);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      alert('❌ ส่งแบบประเมินแบบกลุ่มไม่สำเร็จ:\n' + (err instanceof Error ? err.message : String(err)));
                                    } finally {
                                      setSendingBulkEmail(false);
                                    }
                                  }}
                                  disabled={sendingBulkEmail || checkedInLength === 0}
                                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs transition duration-150 shadow-md flex items-center gap-1.5 min-h-[38px] cursor-pointer"
                                >
                                  {sendingBulkEmail ? 'กำลังกระจายคำชวนประเมิน...' : `✉️ ปล่อยลิงก์ส่งแบบประเมินความพึงพอใจ (${checkedInLength} คน)`}
                                </button>
                              </div>
                            </div>

                            {/* Feedbacks comments list */}
                            {matchedRegs.filter(r => r.feedback).length > 0 && (
                              <div className="space-y-2 mt-5">
                                <h5 className="text-xs font-bold text-slate-700 uppercase">ความคิดเห็นจากแบบประเมินความพึงพอใจล่าสุด ({matchedRegs.filter(r => r.feedback).length} รายการ)</h5>
                                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                  {matchedRegs.filter(r => r.feedback).map((r, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-3xs transition hover:bg-slate-50/50">
                                      <div className="flex justify-between font-bold text-slate-800">
                                        <span>{r.name} ({r.department})</span>
                                        <div className="flex gap-1.5 items-center">
                                          <span className="text-amber-500 font-extrabold">⭐ {r.feedback?.satisfaction} / 5</span>
                                          {r.feedback?.recommendation && (
                                            <span className="text-blue-600 font-extrabold">| ความประสงค์แนะนำ: {r.feedback.recommendation} ดาว</span>
                                          )}
                                        </div>
                                      </div>
                                      {r.feedback?.comments && (
                                        <p className="text-slate-600 mt-1 italic pl-1 font-semibold">" {r.feedback.comments} "</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}
            </div>
          )}
        </div>
      )}
    </div>
  ) : activeTab === 'applicants' ? (
    /* APPLICANTS TAB (รายชื่อผู้สมัครอบรมและการจัดการเช็คอิน) */
    (() => {
       const selectedCourse = courses.find(c => c.id === selectedCourseId);
       const courseRegs = registrations
         .filter(r => r.courseId === selectedCourseId)
         .sort((a, b) => {
           const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
           const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
           return timeA - timeB;
         });
       
       const filteredRegs = courseRegs.filter(r => {
         const p = personnel.find(x => x.id === r.personnelId || (r.email && x.email && x.email.toLowerCase() === r.email.toLowerCase()));
         const pCurriculum = getDisplayCurriculum(p?.curriculum, p?.department);
         const pPosition = p?.position || r.position || '';
         if (applicantStatusFilter === 'checkedIn' && !r.checkedIn) return false;
         if (applicantSearchQuery.trim()) {
           const q = applicantSearchQuery.toLowerCase();
           return (
             (r.name || '').toLowerCase().includes(q) ||
             (r.personnelId || '').toLowerCase().includes(q) ||
             (r.email || '').toLowerCase().includes(q) ||
             pPosition.toLowerCase().includes(q) ||
             (r.department || '').toLowerCase().includes(q) ||
             pCurriculum.toLowerCase().includes(q)
           );
         }
         return true;
       });

       const checkedInParticipantsSorted = [...courseRegs]
         .filter(r => r.checkedIn && r.checkedInAt)
         .sort((a, b) => new Date(a.checkedInAt!).getTime() - new Date(b.checkedInAt!).getTime());

       const getCheckInNumber = (regId: string) => {
         const index = checkedInParticipantsSorted.findIndex(r => r.id === regId);
         if (index === -1) return '-';
         return String(index + 1).padStart(2, '0');
       };

       const getApplicationNumber = (idx: number) => {
         return String(idx + 1).padStart(2, '0');
       };

       const isAllSelected = filteredRegs.length > 0 && filteredRegs.every(r => selectedRegIds[r.id]);

       const handleSelectAllToggle = () => {
         if (isAllSelected) {
           const updated = { ...selectedRegIds };
           filteredRegs.forEach(r => {
             updated[r.id] = false;
           });
           setSelectedRegIds(updated);
         } else {
           const updated = { ...selectedRegIds };
           filteredRegs.forEach(r => {
             updated[r.id] = true;
           });
           setSelectedRegIds(updated);
         }
       };

       const handleSelectRowToggle = (id: string) => {
         setSelectedRegIds(prev => ({
           ...prev,
           [id]: !prev[id]
         }));
       };

       return (
         <div className="space-y-6" id="applicants-tab-content">
           {/* Title & Buttons Grid Block */}
           <div className="bg-white border border-slate-200/80 p-6 rounded-3xl shadow-sm flex flex-col xl:flex-row justify-between items-start gap-6">
             {/* Left Column: Title Block */}
             <div>
               <h1 className="text-3xl font-light text-slate-850 tracking-tight leading-none">รายชื่อ</h1>
               <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none mt-1.5">ผู้ลงทะเบียน</h1>
               <p className="text-xs text-slate-500 font-semibold mt-3 max-w-sm leading-relaxed">
                 ตรวจสอบและจัดการรายชื่อบุคลากรที่สมัครเข้าร่วมอบรม
               </p>
             </div>
             
             {/* Right Column: Custom Button Action Matrix from Mockup */}
             <div className="flex flex-col gap-3 items-end w-full xl:w-auto">
               {/* Row 1 of buttons: Cert, Notification, Feedback, Download Actual, Download Eval */}
               <div className="flex flex-wrap gap-2 justify-end w-full">
                 {/* Certificate */}
                 <button
                   type="button"
                   onClick={() => {
                     const selCourse = courses.find(c => c.id === selectedCourseId);
                     if (!selCourse) { alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนจัดส่งเกียรติบัตรค่ะ'); return; }
                     setModalEmailSubject(`[ยินดีด้วยค่ะ] ท่านได้รับเกียรติบัตรรับรองจากโครงการอบรมวิชา ${selCourse.title}`);
                     setModalEmailMessage(
                       `เรียน คณาจารย์ผู้ทรงคุณวุฒิทุกท่าน,\n\nสำนักงานพัฒนาบุคลากร (L&D) ขอขอบพระคุณและขอร่วมแสดงความยินดีกับความสำเร็จที่ท่านได้ผ่านการอบรมสัมมนาวิชาการหัวข้อ "{course_title}" บรรยายโดยวิทยากร: {speaker} เป็นที่เรียบร้อยแล้วค่ะ\n\nท่านสามารถดาวน์โหลดไฟล์ประกาศนียบัตรเกียรติบัตรอิเล็กทรอนิกส์ของท่านได้ที่ลิงก์ด้านล่างนี้:\n\nหวังเป็นอย่างยิ่งว่าจะได้มีโอกาสเรียนเชิญท่านเข้าร่วมสัมมนาโครงการดีๆ ในรอบถัดไป\n\nด้วยความเคารพอย่างสูง,\nสำนักงานพัฒนาอาจารย์และบุคลากร (Learning Development Office, BU)`
                     );
                     setShowCertificateModal(true);
                   }}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-750 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <Award className="h-3.5 w-3.5 text-amber-500" />
                   <span>ส่งใบ Certificate</span>
                 </button>

                 {/* Send notification */}
                 <button
                   type="button"
                   onClick={() => {
                     const selCourse = courses.find(c => c.id === selectedCourseId);
                     if (!selCourse) { alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนส่งอีเมลแจ้งเตือนค่ะ'); return; }
                     setModalEmailSubject(reminderSubject || `[แจ้งเตือน] เตรียมความพร้อมเข้าเรียนวิชา ${selCourse.title}`);
                     setModalEmailMessage(
                       reminderHtml || `เรียน คณาจารย์ผู้ทรงคุณวุฒิทุกท่าน,\n\nระบบ L&D ขอแจ้งเตือนกำหนดการเข้าเรียนหลักสูตร "{course_title}" ซึ่งมีกำหนดการจัดในวันที่ {date_time} ณ สถานที่: {location} บรรยายโดยวิทยากร: {speaker}\n\nกรุณาเตรียมสมาร์ทโฟนของท่านให้พร้อมเพื่อใช้ในการสแกน Check-In หน้าห้องอบรมสัมมนาเพื่อสลักเวลาและรับสิทธิ์ดาวน์โหลดเอกสารสัมมนาค่ะ\n\nลิงก์ประวัติของท่าน: {register_link}\n\nด้วยความเคารพอย่างสูง,\nสำนักงานพัฒนาอาจารย์และบุคลากร (Learning Development Office, BU)`
                     );
                     setShowReminderModal(true);
                   }}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-755 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <Mail className="h-3.5 w-3.5 text-blue-500" />
                   <span>ส่งอีเมลแจ้งเตือน</span>
                 </button>

                 {/* Send feedback */}
                 <button
                   type="button"
                   onClick={() => {
                     const selCourse = courses.find(c => c.id === selectedCourseId);
                     if (!selCourse) { alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนส่งแบบประเมินผลค่ะ'); return; }
                     setModalEmailSubject(evaluationSubject || `[เรียนเชิญ] ช่วยตอบแบบประเมินความพึงพอใจการอบรมวิชา ${selCourse.title}`);
                     setModalEmailMessage(
                       evaluationHtml || `เรียน คณาจารย์ผู้ทรงคุณวุฒิทุกท่าน,\n\nขอขอบพระคุณที่ท่านได้ให้ความสนใจและร่วมอบรมในหลักสูตร "{course_title}" ไปเมื่อเร็วๆ นี้\n\nเพื่อเป็นแนวทางและปรับปรุงหัวข้อการอบรมสัมมนาในครั้งต่อไปให้มีคุณภาพสูงสุด ใคร่ขอความอนุเคราะห์จากท่านสละเวลาสแกนตอบแบบประเมินความพึงพอใจตามแบบฟอร์มคลาวด์รายบุคคล\n\nลิงก์ตอบแบบประเมิน: {survey_link}\n\nขอบพระคุณในความร่วมมือและขอแสดงความนับถือ,\nสำนักงานพัฒนาอาจารย์และบุคลากร (Learning Development Office, BU)`
                     );
                     setShowEvaluationModal(true);
                   }}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-755 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                   <span>ส่งแบบประเมินผล</span>
                 </button>

                 {/* Download Actual Attendees */}
                 <button
                   type="button"
                   onClick={handleDownloadActualAttendees}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-755 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <Download className="h-3.5 w-3.5 text-slate-400" />
                   <span>ดาวน์โหลดที่มาอบรมจริง</span>
                 </button>

                 {/* Download Evaluation */}
                 <button
                   type="button"
                   onClick={handleDownloadEvaluations}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-755 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <Download className="h-3.5 w-3.5 text-indigo-400" />
                   <span>ดาวน์โหลดผลประเมิน</span>
                 </button>
               </div>

               {/* Row 2 of buttons: Filter all / checkedIn, Export CSV, Refresh/Update index, QR Code Check-in */}
               <div className="flex flex-wrap gap-2 justify-end items-center w-full">
                 {/* Segmented Control filters */}
                 <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                   <button
                     type="button"
                     onClick={() => setApplicantStatusFilter('all')}
                     className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                       applicantStatusFilter === 'all'
                         ? 'bg-rose-700 text-white shadow-sm'
                         : 'text-slate-500 hover:text-slate-800'
                     }`}
                   >
                     ทั้งหมด
                   </button>
                   <button
                     type="button"
                     onClick={() => setApplicantStatusFilter('checkedIn')}
                     className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                       applicantStatusFilter === 'checkedIn'
                         ? 'bg-rose-700 text-white shadow-sm'
                         : 'text-slate-500 hover:text-slate-800'
                     }`}
                   >
                     มาอบรมจริง
                   </button>
                 </div>

                 {/* Export registrations CSV */}
                 <button
                   type="button"
                   onClick={() => {
                     if (!selectedCourseId) { alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนค่ะ'); return; }
                     const matched = registrations
                       .filter(r => r.courseId === selectedCourseId)
                       .sort((a, b) => {
                         const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
                         const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
                         return timeA - timeB;
                       });
                     if (matched.length === 0) {
                       alert('ไม่มีข้อมูลผู้สมัครที่ต้องการส่งออกค่ะ');
                       return;
                     }
                     const csvHeaders = ['รหัสบุคลากร', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'อีเมล', 'สังกัด/หน่วยงาน', 'หลักสูตร', 'เช็คอินเข้างาน', 'เช็คอินเมื่อ', 'ประเมินแล้ว', 'ความพึงพอใจ'];
                     const csvRows = matched.map(r => {
                       const p = personnel.find(x => (r.personnelId && x.id === r.personnelId) || (r.email && x.email && x.email.toLowerCase() === r.email.toLowerCase()));
                       const pId = p?.id || r.personnelId || '-';
                       const pName = p?.name || r.name || '-';
                       const pPos = p?.position || r.position || '-';
                       const pEmail = p?.email || r.email || '-';
                       const pDept = p?.department || r.department || '-';
                       const pCurriculum = getDisplayCurriculum(p?.curriculum, pDept);

                       return [
                         pId, 
                         pName, 
                         pPos,
                         pEmail, 
                         pDept, 
                         pCurriculum,
                         r.checkedIn ? 'YES' : 'NO', 
                         r.checkedInAt || '',
                         r.feedback ? 'YES' : 'NO', 
                         r.feedback?.satisfaction || ''
                       ];
                     });
                     const selCourse = courses.find(c => c.id === selectedCourseId);
                     downloadCSV(`registrations_${selCourse?.title || 'course'}.csv`, csvHeaders, csvRows);
                   }}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-755 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <Download className="h-3.5 w-3.5 text-rose-500" />
                   <span>ส่งออก รายชื่อสมัคร (CSV)</span>
                 </button>

                 {/* ปรับปรุงลำดับที่ */}
                 <button
                   type="button"
                   onClick={() => {
                     alert('ระบบได้อัปเดตและจัดระเบียบลำดับการสมัครและเช็คอินเรียบร้อยแล้วค่ะ');
                   }}
                   className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-755 font-bold rounded-xl text-xs transition hover:bg-slate-50 min-h-[38px] shadow-sm cursor-pointer"
                 >
                   <RotateCw className="h-3.5 w-3.5 text-slate-500" />
                   <span>ปรับปรุงลำดับที่</span>
                 </button>

                 {/* QR Code Check-in button */}
                 <button
                   type="button"
                   onClick={() => {
                     const selCourse = courses.find(c => c.id === selectedCourseId);
                     if (!selCourse) {
                       alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนเปิด QR Code ค่ะ');
                       return;
                     }
                     setQrCourse(selCourse);
                     setShowQrModal(true);
                   }}
                   className="flex items-center gap-1.5 px-4 py-2 bg-[#5D5FEF] hover:bg-[#4E50DE] text-white font-extrabold rounded-xl text-xs transition min-h-[38px] shadow-md cursor-pointer"
                 >
                   <QrCode className="h-4 w-4" />
                   <span>QR Code Check-in</span>
                  </button>

                  {/* QR Code Evaluation button */}
                  <button
                    type="button"
                    onClick={() => {
                      const selCourse = courses.find(c => c.id === selectedCourseId);
                      if (!selCourse) {
                        alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนเปิด QR Code แบบประเมินค่ะ');
                        return;
                      }
                      setQrCourse(selCourse);
                      setShowEvalQrModal(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition min-h-[38px] shadow-md cursor-pointer"
                  >
                    <QrCode className="h-4 w-4" />
                    <span>QR Code แบบประเมิน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const selCourse = courses.find(c => c.id === selectedCourseId);
                      if (!selCourse) {
                        alert('กรุณาเลือกหลักสูตรที่ต้องการจัดการด้านล่างก่อนเพิ่มผู้เข้าอบรมค่ะ');
                        return;
                      }
                      setManualRegisterForm({ personnelId: '', name: '', email: '', department: '' });
                      setManualRegisterError('');
                      setManualSearchQuery('');
                      setShowManualRegisterModal(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition min-h-[38px] shadow-md cursor-pointer ml-2"
                    id="btn-add-participant-manual"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>เพิ่มผู้เข้าอบรมด้วยตนเอง (Manual)</span>
                 </button>
               </div>
             </div>
           </div>

           {/* Search & Selector Row */}
           <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white border border-slate-200/85 p-4 rounded-3xl shadow-sm">
             {/* Search input on left */}
             <div className="relative w-full md:w-96">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
               <input
                 type="text"
                 placeholder="ค้นหาชื่อ, รหัส หรือหน่วยงาน..."
                 value={applicantSearchQuery}
                 onChange={(e) => setApplicantSearchQuery(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 min-h-[40px]"
               />
             </div>

             {/* Select course & Count on right */}
             <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
               <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl hover:bg-slate-100 transition cursor-pointer select-none">
                 <input
                   type="checkbox"
                   checked={showArchivedInDropdown}
                   onChange={(e) => setShowArchivedInDropdown(e.target.checked)}
                   className="rounded text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 cursor-pointer"
                 />
                 <span>แสดงหลักสูตรที่จัดเก็บแล้ว ({courses.filter(c => c.archived).length})</span>
               </label>

               <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-2xl shadow-sm">
                 <Filter className="h-3.5 w-3.5 text-slate-400" />
                 <select
                   value={selectedCourseId}
                   onChange={(e) => {
                     setSelectedCourseId(e.target.value);
                     setSelectedRegIds({}); // Clear selection on course change
                   }}
                   className="bg-transparent border-none p-0 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer max-w-xs md:max-w-md"
                 >
                   <option value="">-- เลือกหลักสูตรฝึกอบรมสัมมนา --</option>
                   {courses.filter(c => !c.archived || c.id === selectedCourseId || showArchivedInDropdown).map(c => (
                     <option key={c.id} value={c.id}>
                       {c.archived ? '📁 [จัดเก็บแล้ว] ' : ''}{c.title}
                     </option>
                   ))}
                 </select>
               </div>
               
               <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-2 rounded-2xl">
                 พบ {filteredRegs.length} รายการ
               </span>
             </div>
           </div>

           {/* Main Registration Table list */}
           <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
             {!selectedCourseId ? (
               <div className="py-20 text-center text-slate-400 space-y-3">
                 <FileSpreadsheet className="h-10 w-10 text-slate-300 mx-auto animate-bounce" />
                 <p className="text-xs font-bold">กรุณาเลือกหลักสูตรฝึกอบรมสัมนาด้านบน เพื่อตรวจสอบรายชื่อและจัดการเข้างานค่ะ</p>
               </div>
             ) : filteredRegs.length === 0 ? (
               <div className="py-20 text-center text-slate-400 space-y-2">
                 <p className="text-xs font-bold">ไม่พบข้อมูลรายชื่อผู้ลงทะเบียนที่ตรงกับข้อจำกัดการค้นหาของคุณค่ะ</p>
                 <p className="text-[11px] text-slate-400">กรุณากรอกข้อมูลสแกนใหม่ หรือเปลี่ยนประเภทการคัดกรอง</p>
               </div>
             ) : (
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100">
                       <th className="py-4 px-5 text-center w-12">
                         <input
                           type="checkbox"
                           checked={isAllSelected}
                           onChange={handleSelectAllToggle}
                           className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4 shadow-sm cursor-pointer"
                         />
                       </th>
                       <th className="py-4 px-3 text-center w-24">ลำดับสมัคร</th>
                       <th className="py-4 px-3 text-center w-24">ลำดับเช็คอิน</th>
                       <th className="py-4 px-3 w-32">รหัสบุคลากร</th>
                       <th className="py-4 px-3">ชื่อ-นามสกุล</th>
                       <th className="py-4 px-3">ตำแหน่ง</th>
                       <th className="py-4 px-3">หน่วยงาน</th>
                       <th className="py-4 px-3 text-orange-700">หลักสูตร</th>
                       <th className="py-4 px-3">อีเมล</th>
                       <th className="py-4 px-3 text-center w-40">สถานะ</th>
                       <th className="py-4 px-5 text-right w-24">การจัดการ</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-150 text-xs text-slate-700">
                     {filteredRegs.map((participant, idx) => {
                       const checkInNum = getCheckInNumber(participant.id);
                       const appNum = getApplicationNumber(idx);
                       const p = personnel.find(x => (participant.personnelId && x.id === participant.personnelId) || (participant.email && x.email && x.email.toLowerCase() === participant.email.toLowerCase()));
                       const displayId = p?.id || participant.personnelId || '-';
                       const displayName = p?.name || participant.name || '-';
                       const displayPosition = p?.position || participant.position || '-';
                       const displayEmail = p?.email || participant.email || '-';
                       const displayDept = p?.department || participant.department || '-';
                       const displayCurriculum = getDisplayCurriculum(p?.curriculum, displayDept);
                       
                       return (
                         <tr key={participant.id} className="hover:bg-slate-50/60 transition duration-75">
                           <td className="py-3 px-5 text-center">
                             <input
                               type="checkbox"
                               checked={!!selectedRegIds[participant.id]}
                               onChange={() => handleSelectRowToggle(participant.id)}
                               className="rounded text-rose-600 focus:ring-rose-500 h-4 w-4 shadow-sm cursor-pointer"
                             />
                           </td>
                           <td className="py-3 px-3 text-center font-mono font-bold text-slate-400">{appNum}</td>
                           <td className="py-3 px-3 text-center font-mono font-bold text-rose-600">
                             {participant.checkedIn ? checkInNum : '-'}
                           </td>
                           <td className="py-3 px-3 font-mono font-bold text-slate-800">{displayId}</td>
                           <td className="py-3 px-3 font-extrabold text-slate-900">{displayName}</td>
                           <td className="py-3 px-3 text-slate-600 font-medium">{displayPosition}</td>
                           <td className="py-3 px-3 text-slate-600 font-semibold">{displayDept}</td>
                           <td className="py-3 px-3 font-medium text-orange-700">
                             <span className="bg-orange-50 border border-orange-100/55 rounded-md px-2.5 py-1 inline-block max-w-[280px] whitespace-normal break-words leading-normal text-[11px]" title={displayCurriculum}>
                               {displayCurriculum}
                             </span>
                           </td>
                           <td className="py-3 px-3 font-mono text-slate-500">{displayEmail}</td>
                           <td className="py-3 px-3 text-center">
                             <button
                               type="button"
                               onClick={() => handleToggleCheckInManual(participant)}
                               className={`px-3 py-1 rounded-xl font-bold text-[10px] transition border cursor-pointer ${
                                 participant.checkedIn
                                   ? 'bg-emerald-50 text-emerald-750 border-emerald-200 hover:bg-emerald-100'
                                   : 'bg-slate-50 text-slate-550 border-slate-200 hover:bg-slate-100'
                               }`}
                             >
                               {participant.checkedIn ? '✅ เช็คอินสำเร็จ' : '⏳ ยังไม่ได้เช็คอิน'}
                             </button>
                           </td>
                           <td className="py-3 px-5 text-right">
                             <div className="flex gap-2 justify-end items-center">
                               <button
                                 type="button"
                                 onClick={() => handleStartEditRegistration(participant)}
                                 className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-650 border border-slate-200 rounded-lg font-bold text-[10px] transition cursor-pointer"
                               >
                                 แก้ไข
                               </button>
                               <button
                                 type="button"
                                 onClick={() => selectedCourse && handleDeleteRegistrationManual(participant, selectedCourse)}
                                 className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                 title="ลบรายชื่อ"
                               >
                                 <Trash2 className="h-4 w-4" />
                               </button>
                             </div>
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
       );
    })()
  ) : activeTab === 'personnel' ? (
        /* PERSONNEL DATABASES VIEW WITH CSV IMPORT */
        <div className="space-y-6" id="personnel-tab-content">
          
          {/* PERSONNEL DATABASE ACCORDION & CSV IMPORT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left form & CSV box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-6">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                  <Upload className="h-5 w-5 text-orange-600" />
                  <span>นำเข้าข้อมูลบุคลากรผ่าน CSV</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">นำเข้ารายชื่ออาจารย์และสายวิชาการผ่าน CSV อัตโนมัติ ป้องกันการสะสมข้อมูลลงทะเบียนตกหล่น</p>
              </div>

              {/* Encoding selection helper */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1.5">
                <span className="font-bold text-slate-750 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-orange-600" />
                  <span>ระบบถอดรหัสภาษาไฟล์ (Encoding):</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setCsvEncoding('auto')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-center border transition cursor-pointer ${
                      csvEncoding === 'auto' 
                        ? 'bg-orange-600 text-white border-orange-600 shadow-xs font-bold' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ⚡ ตรวจจับอัตโนมัติ (แนะนำ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCsvEncoding('windows-874')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-center border transition cursor-pointer ${
                      csvEncoding === 'windows-874' 
                        ? 'bg-orange-600 text-white border-orange-600 shadow-xs font-bold' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="สำหรับไฟล์ที่ Save เป็น CSV จาก Microsoft Excel ภาษาไทย"
                  >
                    🇹🇭 Windows-874 (Excel ไทย)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCsvEncoding('utf-8')}
                    className={`py-1.5 px-2 rounded-lg font-medium text-center border transition cursor-pointer ${
                      csvEncoding === 'utf-8' 
                        ? 'bg-orange-600 text-white border-orange-600 shadow-xs font-bold' 
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="สำหรับไฟล์ CSV ที่เป็น UTF-8 สากล"
                  >
                    🌐 UTF-8 (สากล)
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  * หากไฟล์ที่เซฟมาจาก Excel มีปัญหาภาษาเพี้ยน/ต่างดาว ระบบจะตรวจจับและแก้รหัสเป็น Windows-874 ให้อัตโนมัติค่ะ
                </p>
              </div>

              {/* Drag n drop area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processCsvFile(file);
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center cursor-pointer transition ${
                  isDragging ? 'border-orange-600 bg-orange-50/50' : 'border-slate-200 hover:border-slate-300'
                }`}
                id="drag-csv-box"
              >
                <Landmark className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-700">ลากและวางไฟล์ CSV ของท่านที่นี่</p>
                <p className="text-[10px] text-slate-400 mt-1">รองรับทั้งไฟล์ Excel ภาษาไทย (Windows-874/TIS-620) และ UTF-8</p>
                
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-hidden-input"
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('csv-hidden-input')?.click()}
                  className="mt-3 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded text-[10px] text-slate-600 font-semibold relative cursor-pointer"
                >
                  เลือกไฟล์เครื่องคอมพิวเตอร์
                </button>
              </div>

              {/* CSV Import layout guide */}
              <div className="text-[10px] text-slate-500 bg-white border border-slate-100 p-3.5 rounded-xl space-y-1">
                <strong>📝 โครงสร้างหัวตารางไฟล์ Excel/CSV ที่ตรงตามระบบ (8 คอลัมน์):</strong>
                <code className="block bg-slate-50 p-2 rounded text-amber-800 font-mono text-[9px] overflow-x-auto whitespace-pre">
                  รหัสบุคคล, ชื่อ-นามสกุล, ตำแหน่ง, หลักสูตร, ภาควิชา, หน่วยงาน, อีเมล, โทรศัพท์<br />
                  10502041, สมจิตร์ ใจบุญ, อาจารย์, เทคโนโลยีสารสนเทศ, เทคโนโลยีสารสนเทศ, คณะเทคโนโลยีสารสนเทศและนวัตกรรม, somjit.j@bu.ac.th, 02-350-3500
                </code>
              </div>

              {importReport && (
                <div className="p-3.5 rounded-xl text-xs font-bold bg-white border border-slate-100 shadow-sm" id="import-report">
                  {importReport}
                </div>
              )}

              <hr className="border-slate-200" />

              {/* Individual additions action */}
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <Plus className="h-4.5 w-4.5 text-orange-600" />
                  <span>เพิ่มบุคลากรรายบุคคล (Individual CRUD)</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setPersonnelForm({ id: '', name: '', position: '', curriculum: '', academicDepartment: '', department: '', email: '', phone: '' });
                    setEditingPersonnelId(null);
                    setShowPersonnelForm(!showPersonnelForm);
                  }}
                  className="w-full mt-3 h-10 border border-orange-200 hover:bg-orange-50 text-orange-700 font-semibold rounded-lg text-xs transition duration-150 flex items-center justify-center gap-1 relative"
                  id="btn-personnel-crud-toggle"
                >
                  {showPersonnelForm ? 'ปิดหน้าต่างกรอก' : 'เขียนลงทะเบียนเป็นรายคน'}
                </button>
              </div>

              {/* Individual additions Form */}
              {showPersonnelForm && (
                <form onSubmit={handleSavePersonnel} className="space-y-3 bg-white p-4 border border-slate-100 rounded-xl" id="form-save-personnel">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">รหัสบุคคล / รหัสบุคลากร * {editingPersonnelId && '(ไม่สามารถแก้ไขได้)'}</label>
                    <input
                      type="text"
                      required
                      disabled={!!editingPersonnelId}
                      placeholder="เช่น 10502011"
                      value={personnelForm.id || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, id: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:outline-none focus:border-orange-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">ชื่อ - นามสกุลจริง *</label>
                    <input
                      type="text"
                      required
                      placeholder="สมชาย แก้วเจริญ"
                      value={personnelForm.name || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">ตำแหน่ง *</label>
                    <input
                      type="text"
                      required
                      placeholder="เลือกหรือพิมพ์ตำแหน่ง เช่น คณบดี, อาจารย์ประจำ, เจ้าหน้าที่..."
                      value={personnelForm.position || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, position: e.target.value})}
                      list="preset-positions"
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                    <datalist id="preset-positions">
                      <option value="คณบดี" />
                      <option value="รองคณบดี" />
                      <option value="ผู้อำนวยการหลักสูตร" />
                      <option value="ผู้อำนวยการสำนัก" />
                      <option value="หัวหน้าหลักสูตร" />
                      <option value="หัวหน้าภาค" />
                      <option value="หัวหน้าสาขา" />
                      <option value="อาจารย์ประจำ" />
                      <option value="บุคลากรประจำ" />
                      <option value="ผู้ประสานงานคณะ" />
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">หลักสูตร</label>
                    <input
                      type="text"
                      placeholder="เช่น เทคโนโลยีสารสนเทศ หรือ ใส่เครื่องหมาย - หากไม่มี"
                      value={personnelForm.curriculum || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, curriculum: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">ภาควิชา</label>
                    <input
                      type="text"
                      placeholder="เช่น เทคโนโลยีสารสนเทศ หรือ ใส่เครื่องหมาย - หากไม่มี"
                      value={personnelForm.academicDepartment || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, academicDepartment: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">หน่วยงาน / สังกัดคณะ *</label>
                    <input
                      type="text"
                      required
                      placeholder="เช่น คณะเทคโนโลยีสารสนเทศและนวัตกรรม"
                      value={personnelForm.department || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, department: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">อีเมล (@bu.ac.th เท่านั้น) *</label>
                    <input
                      type="email"
                      required
                      placeholder="somchai.k@bu.ac.th"
                      value={personnelForm.email || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, email: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500">โทรศัพท์</label>
                    <input
                      type="text"
                      placeholder="02-350-3500 หรือ หมายเลขภายใน"
                      value={personnelForm.phone || ''}
                      onChange={(e) => setPersonnelForm({...personnelForm, phone: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full h-10 bg-orange-655 hover:bg-orange-700 text-white font-bold rounded text-xs shadow-sm transition"
                  >
                    {editingPersonnelId ? '💾 บันทึกการแก้ไขข้อมูลบุคลากร' : '➕ ยืนยันการเพิ่มบุคลากรรายบุคคล'}
                  </button>
                </form>
              )}


          </div>
            {/* Right List Panel with search pagination */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm col-span-2 overflow-hidden flex flex-col justify-between" id="personnel-database-list font-sans">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-base">ฐานแฟ้มบัญชีรายชื่อบุคลากรตรวจสอบสะสม</h3>
                    <p className="text-xs text-slate-400 mt-0.5">จัดการ ตรวจสอบ และส่งออกรายชื่อทั้งหมดเพื่อใช้ในงานสถิติและงานบริหารหลักสูตร</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-bold">บุคลากรทั้งหมด {personnel.length} คน</span>
                    {corruptedPersonnelCount > 0 && (
                      <button
                        type="button"
                        onClick={handleCleanCorruptedPersonnel}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition duration-150 flex items-center gap-1.5 cursor-pointer border border-rose-200"
                        id="btn-clean-corrupted"
                        title="ลบข้อมูลบุคลากรที่มีอักขระเพี้ยน/สัญลักษณ์  ออกจากฐานข้อมูล"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                        <span>ลบข้อมูลเพี้ยน ({corruptedPersonnelCount})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCleanSystemDuplicates}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition duration-150 flex items-center gap-1.5 cursor-pointer border border-slate-200"
                      id="btn-clean-duplicates"
                      title="ตรวจจับและคัดกรองลบข้อมูลซ้ำในฐานข้อมูล"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                      <span>คัดกรองข้อมูลซ้ำ</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPersonnel}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 font-semibold text-xs rounded-xl transition duration-150 flex items-center gap-1 cursor-pointer border border-slate-200"
                      id="btn-clear-all"
                      title="ล้างฐานข้อมูลบุคลากรทั้งหมดเพื่อนำเข้าใหม่"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>ล้างทั้งหมด</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPersonnelDatabase}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs transition duration-150 flex items-center gap-1.5 cursor-pointer"
                      id="btn-export-personnel-csv"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>ส่งออก CSV</span>
                    </button>
                  </div>
                </div>

                {/* Corrupted Data Alert Banner */}
                {corruptedPersonnelCount > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">⚠️ ตรวจพบข้อมูลบุคลากรที่มีอักขระเพี้ยน / ตัวอักษรต่างดาว ({corruptedPersonnelCount} รายการ)</div>
                        <div className="text-amber-700 text-[11px] mt-0.5">
                          เกิดจากไฟล์ CSV เดิมถูกบันทึกด้วยรหัสภาษา Windows-874 ของ Excel ท่านสามารถกด <strong>"ลบข้อมูลที่เพี้ยน"</strong> หรือลากไฟล์ CSV เดิมมานำเข้าใหม่ได้ทันที ระบบจะถอดรหัสภาษาไทยถูกต้อง 100% และอัปเดตตำแหน่งล่าสุดให้ครบถ้วนค่ะ
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCleanCorruptedPersonnel}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs shadow-xs transition duration-150 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>ลบเฉพาะรายการที่เพี้ยน</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Filter Personnel input search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ดักจับค้นหาตามชื่อสกุล, รหัสสาขาวิชา, สังกัดหน่วยงาน, หรือตำแหน่งอีเมล..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setPersonnelPage(1); }}
                    className="w-full bg-slate-50 border border-slate-100 text-slate-800 py-2.5 pl-10 pr-4 rounded-xl text-xs focus:outline-none"
                    id="input-personnel-search"
                  />
                </div>

                {paginatedPersonnel.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs">ไม่พบบุคลากรหรืออาจารย์ตามเงื่อนไขค้นหาของท่าน</div>
                ) : (
                  <div className="overflow-x-auto overflow-y-auto max-h-[550px] border border-slate-100/80 rounded-xl shadow-inner scrollbar-thin scrollbar-thumb-slate-200">
                    <table className="w-full border-collapse text-left text-xs text-slate-600">
                      <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgba(241,245,249,1)]">
                        <tr className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                          <th 
                            className="py-3 px-3 bg-white cursor-pointer select-none text-orange-700 font-bold hover:bg-orange-50/60 transition duration-150 rounded-lg group"
                            onClick={() => setPersonnelSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            title="คลิกเพื่อสลับการเรียงลำดับรหัสบุคคล (น้อยไปมาก / มากไปน้อย)"
                          >
                            <div className="flex items-center gap-1">
                              <span>รหัสบุคคล</span>
                              {personnelSortOrder === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5 text-orange-600 transition duration-150" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 text-orange-600 transition duration-150" />
                              )}
                            </div>
                          </th>
                          <th className="py-3 px-3 bg-white">ชื่อ-นามสกุล</th>
                          <th className="py-3 px-3 bg-white">ตำแหน่ง</th>
                          <th className="py-3 px-3 bg-white font-semibold">หลักสูตร</th>
                          <th className="py-3 px-3 bg-white">ภาควิชา</th>
                          <th className="py-3 px-3 bg-white">หน่วยงาน</th>
                          <th className="py-3 px-3 bg-white">อีเมล</th>
                          <th className="py-3 px-3 bg-white">โทรศัพท์</th>
                          <th className="py-3 px-3 text-right bg-white">ควบคุม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {paginatedPersonnel.map(person => (
                          <tr key={person.id} className="hover:bg-slate-50 duration-100 font-medium">
                            <td className="py-3 px-3 font-mono font-bold text-slate-900">{person.id}</td>
                            <td className="py-3 px-3 font-semibold text-slate-900">{person.name}</td>
                            <td className="py-3 px-3 text-slate-500">{person.position || '-'}</td>
                            <td className="py-3 px-3 font-medium text-orange-700">
                              <span className="bg-orange-50 border border-orange-100/55 rounded-md px-2.5 py-1 inline-block max-w-[200px] whitespace-normal break-words leading-normal text-[11px]" title={getDisplayCurriculum(person.curriculum, person.department)}>
                                {getDisplayCurriculum(person.curriculum, person.department)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              <span className="bg-slate-50 border border-slate-200/70 rounded-md px-2 py-0.5 inline-block text-[11px] max-w-[180px] whitespace-normal break-words">
                                {person.academicDepartment && person.academicDepartment !== '-' ? person.academicDepartment : '-'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-500">{person.department}</td>
                            <td className="py-3 px-3 text-slate-500">{person.email}</td>
                            <td className="py-3 px-3 text-slate-500">{person.phone || '-'}</td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex justify-end items-center gap-1">
                                <button
                                  onClick={() => handleEditPersonnel(person)}
                                  className="p-1.5 hover:bg-orange-50 text-orange-650 hover:text-orange-700 rounded transition"
                                  id={`btn-edit-personnel-${person.id}`}
                                  title="แก้ไขข้อมูล"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeletePersonnel(person.id)}
                                  className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition"
                                  id={`btn-delete-personnel-${person.id}`}
                                  title="ลบข้อมูล"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination indicators footer */}
              {totalPersonnelPages > 1 && (
                <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-6 text-xs text-slate-500">
                  <span>แสดงผลลัพธ์หน้า {personnelPage} จาก {totalPersonnelPages} หน้า</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPersonnelPage(p => Math.max(1, p - 1))}
                      disabled={personnelPage === 1}
                      className="px-3 py-1 bg-slate-50 text-slate-600 border border-slate-100 rounded disabled:opacity-40 font-bold transition duration-150 relative min-h-[44px]"
                    >
                      หน้าก่อน
                    </button>
                    <button
                      onClick={() => setPersonnelPage(p => Math.min(totalPersonnelPages, p + 1))}
                      disabled={personnelPage === totalPersonnelPages}
                      className="px-3 py-1 bg-slate-50 text-slate-600 border border-slate-100 rounded disabled:opacity-40 font-bold transition duration-150 relative min-h-[44px]"
                    >
                      หน้าถัดไป
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'admins' ? (
        /* MANAGE ADMIN ACCESS ROLES */
        <div className="space-y-6" id="admins-tab-content">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Admin Add view left */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                  <Shield className="h-5 w-5 text-orange-600" />
                  <span>แต่งตั้งแอดมินเจ้าหน้าที่</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">กำหนดระดับสิทธิ์ให้บุคคลภายใน เพื่อให้สามารถเข้าจัดการข้อมูลกิจกรรม รายชื่อผู้ประเมินผลสัมมนา นำเข้า และ Export CSV ได้</p>
              </div>

              <form onSubmit={handleAddAdmin} className="space-y-3" id="form-save-admin">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">อีเมลสิทธิแอดมิน (@bu.ac.th เท่านั้น) *</label>
                  <input
                    type="email"
                    required
                    placeholder="เช่น deans.office@bu.ac.th"
                    value={adminForm.email || ''}
                    onChange={(e) => setAdminForm({...adminForm, email: e.target.value})}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                    id="admin-form-email"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">ชื่อ-นามสกุลจริง *</label>
                  <input
                    type="text"
                    required
                    placeholder="ปณิสรา ลิ้มเลิศวิบูลย์ (กุมารินทร์)"
                    value={adminForm.name || ''}
                    onChange={(e) => setAdminForm({...adminForm, name: e.target.value})}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                    id="admin-form-name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">รหัสบุคลากร</label>
                  <input
                    type="text"
                    placeholder="เช่น 10502011"
                    value={adminForm.staffId || ''}
                    onChange={(e) => setAdminForm({...adminForm, staffId: e.target.value})}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                    id="admin-form-staffid"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">ตำแหน่ง</label>
                  <input
                    type="text"
                    placeholder="เช่น รองอธิการบดีฝ่ายวิชาการ"
                    value={adminForm.position || ''}
                    onChange={(e) => setAdminForm({...adminForm, position: e.target.value})}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                    id="admin-form-position"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">หน่วยงาน / สังกัด</label>
                  <input
                    type="text"
                    placeholder="เช่น สำนักบริหารวิชาการ"
                    value={adminForm.department || ''}
                    onChange={(e) => setAdminForm({...adminForm, department: e.target.value})}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                    id="admin-form-department"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    placeholder="เช่น 02-407-3888 ต่อ 2411"
                    value={adminForm.phone || ''}
                    onChange={(e) => setAdminForm({...adminForm, phone: e.target.value})}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs"
                    id="admin-form-phone"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">สิทธิ์การใช้งาน (Role)</label>
                  <div className="w-full bg-slate-100 border border-slate-250 p-2.5 rounded-lg text-xs font-bold text-slate-700">
                    Admin (ผู้ดูแลระบบ)
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-11 rounded-lg text-xs shadow-sm transition"
                  id="btn-admin-submit"
                >
                  อนุมัติสิทธิ์เข้าถึงระบบแอดมิน
                </button>
              </form>

              <div className="border-t border-slate-200/80 pt-4 mt-2 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block flex items-center gap-1">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    <span>หรือ นำเข้าแอดมินผ่าน CSV</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const headers = ['อีเมล', 'ชื่อ-นามสกุล', 'รหัสบุคลากร', 'ตำแหน่ง', 'หน่วยงาน', 'โทรศัพท์'];
                      const demoRows = [
                        ['pacharin.s@bu.ac.th', 'พัชรินทร์ สินธิพงษ์', '10203001', 'หัวหน้าฝ่ายพัฒนาศักยภาพบุคลากร', 'สถาบันพัฒนาบุคลากร', '02-407-3888 ต่อ 2411'],
                        ['somchai.j@bu.ac.th', 'สมชาย ใจดี', '10203002', 'เจ้าหน้าที่เทคโนโลยีสารสนเทศ', 'สำนักเทคโนโลยีสารสนเทศ', '02-407-3888 ต่อ 2412']
                      ];
                      downloadCSV('admin_import_template.csv', headers, demoRows);
                    }}
                    className="text-[10px] text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1"
                  >
                    📥 ดาวน์โหลดเทมเพลต CSV
                  </button>
                </div>

                <div className="border border-dashed border-slate-250 rounded-xl p-4 bg-white hover:bg-slate-50 text-center cursor-pointer hover:border-orange-350 transition duration-150 relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) processAdminCsvFile(file);
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                  />
                  <div className="space-y-1">
                    <div className="text-slate-400 flex justify-center">
                      <Upload className="h-6 w-6 stroke-[1.5]" />
                    </div>
                    <p className="text-[11px] font-bold text-slate-700">คลิก หรือลากไฟล์ CSV เพื่อนำเข้าที่นี่</p>
                    <p className="text-[9px] text-slate-400">คอลัมน์ข้อมูล: อีเมล, ชื่อ-นามสกุล, รหัสบุคลากร, ตำแหน่ง, หน่วยงาน, โทรศัพท์</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Admin List */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm col-span-2 space-y-4" id="admins-list-container">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base" id="admins-list-title">
                    ประธานคณะกรรมการและเจ้าหน้าที่ผู้บริหาร (Authorized Admins)
                  </h3>
                  <p className="text-slate-400 text-xs mt-0.5">รายชื่อและสิทธิ์การเข้าดูแลระบบของเจ้าหน้าที่แต่ละฝ่าย</p>
                </div>
                <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold whitespace-nowrap">
                  ทั้งหมด {adminsList.length} บัญชี
                </span>
              </div>
              
              <div className="overflow-x-auto" id="admin-table-wrapper">
                <table className="w-full border-collapse text-left text-xs text-slate-600" id="admin-table-element">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3">รหัสบุคลากร</th>
                      <th className="py-3 px-3">ชื่อ-นามสกุล</th>
                      <th className="py-3 px-3">ตำแหน่ง</th>
                      <th className="py-3 px-3">หน่วยงาน / สังกัด</th>
                      <th className="py-3 px-3">อีเมล (สิทธิ์ล็อกอิน)</th>
                      <th className="py-3 px-3">เบอร์โทรศัพท์</th>
                      <th className="py-3 px-3 text-center">เริ่มดำรงสิทธิ์</th>
                      <th className="py-3 px-3 text-right">ควบคุม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {adminsList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-400 font-medium font-sans">
                          ไม่พบข้อมูลประธานคณะกรรมการหรือวิทยากรแอดมินในฐานข้อมูล
                        </td>
                      </tr>
                    ) : (
                      adminsList.map(adm => (
                        <tr 
                          key={adm.email} 
                          className="hover:bg-slate-50 duration-100 font-medium"
                          id={`admin-row-${adm.email.replace(/\./g, '_')}`}
                        >
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            {adm.staffId || <span className="text-slate-300 italic font-sans font-normal">-</span>}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-900">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{adm.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-orange-100 text-orange-850">
                                Admin
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {adm.position || <span className="text-slate-300 italic font-normal">-</span>}
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {adm.department || <span className="text-slate-300 italic font-normal">-</span>}
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                            {adm.email}
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {adm.phone || <span className="text-slate-300 italic font-normal">-</span>}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-center whitespace-nowrap">
                            {adm.assignedAt ? new Date(adm.assignedAt).toLocaleDateString('th-TH') : '-'}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex gap-1.5 items-center justify-end">
                              <button
                                onClick={() => handleStartEditAdmin(adm)}
                                className="p-1.5 hover:bg-amber-50 text-amber-500 hover:text-amber-700 rounded transition"
                                id={`btn-edit-admin-${adm.email.replace(/\./g, '_')}`}
                                title="แก้ไขข้อมูลเจ้าหน้าที่"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteAdmin(adm.email)}
                                className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition"
                                id={`btn-delete-admin-${adm.email.replace(/\./g, '_')}`}
                                title="ลบสิทธิ์เจ้าหน้าที่"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'invitations' ? (
        <div className="space-y-6" id="invitations-tab-content">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Form: Select Course, Recipients, Subject, Message */}
            <div id="email-campaign-form" className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 scroll-mt-6">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                  <Mail className="h-5 w-5 text-orange-600" />
                  <span>ตั้งค่าแคมเปญส่งจดหมายเชิญ</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">กำหนดกลุ่มเป้าหมาย หัวข้อ และข้อความจดหมายประชาสัมพันธ์เชิญชวนเข้าร่วมโครงการอบรม</p>
              </div>

              {campaignReuseNotification && (
                <div id="campaign-reuse-notification-banner" className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-3.5 flex items-start justify-between gap-3 text-emerald-900 shadow-sm transition-all duration-200">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-extrabold text-emerald-950 text-xs sm:text-sm">
                        {campaignReuseNotification.title}
                      </h4>
                      <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                        {campaignReuseNotification.message}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCampaignReuseNotification(null)}
                    className="text-emerald-700 hover:text-emerald-900 font-bold text-xs p-1 rounded-md hover:bg-emerald-100 transition duration-150 cursor-pointer"
                    title="ปิดข้อความแจ้งเตือน"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {/* Quick Reuse Previous Group Selector */}
                {campaignLogs.length > 0 && (
                  <div className="bg-orange-50/80 border border-orange-200/90 rounded-xl p-3 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-orange-950 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-orange-600" />
                        <span>ดึงรายชื่อกลุ่มที่เคยส่งในอดีต (ดึงมาส่งครั้งต่อไป)</span>
                      </label>
                      <span className="text-[9px] font-extrabold text-orange-700 bg-orange-100/90 px-1.5 py-0.5 rounded">
                        มี {campaignLogs.length} บันทึก
                      </span>
                    </div>
                    <select
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) return;
                        const targetLog = campaignLogs.find(l => l.id === selectedId);
                        if (targetLog) {
                          handleReuseCampaignTargetGroup(targetLog);
                        }
                        e.target.value = '';
                      }}
                      defaultValue=""
                      className="w-full bg-white border border-orange-250 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-semibold focus:ring-2 focus:ring-orange-500 focus:outline-none cursor-pointer"
                    >
                      <option value="" disabled>-- คลิกเลือกกลุ่มจากประวัติที่ผ่านมาเพื่อดึงรายชื่อผู้รับทั้งหมด --</option>
                      {campaignLogs.map(l => {
                        const dateStr = new Date(l.sentAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                        const timeStr = new Date(l.sentAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <option key={l.id} value={l.id}>
                            [{dateStr} {timeStr} น.] {l.courseTitle || 'ไม่มีชื่อวิชา'} — {l.targetDetails} ({l.recipientsCount} คน)
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[9px] text-slate-500">
                      💡 ดึงกลุ่มเป้าหมายเดิมมาพร้อมใช้งานทันที โดยสามารถปรับแก้รายชื่อหรือเลือกหลักสูตรใหม่ได้เลยค่ะ
                    </p>
                  </div>
                )}

                {/* Course Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">เลือกหลักสูตรการอบรม *</label>
                  <select
                    value={campaignCourseId}
                    onChange={(e) => setCampaignCourseId(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    {courses.filter(c => !c.archived || c.id === campaignCourseId || showArchivedInDropdown).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.archived ? '📁 [จัดเก็บแล้ว] ' : ''}{c.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">กลุ่มเป้าหมายผู้รับจดหมาย *</label>
                  <select
                    value={campaignTargetType}
                    onChange={(e) => setCampaignTargetType(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs font-semibold text-slate-800"
                  >
                    <option value="all">บุคลากรทั้งหมด ({personnel.length} คน)</option>
                    <option value="custom_dept">ระบุตามหน่วยงาน / สังกัด</option>
                    <option value="position">ระบุตามประเภท / ตำแหน่ง</option>
                    <option value="specific_personnel">เลือกแบบเจาะจง (ค้นหาและเลือกรายบุคคล)</option>
                  </select>
                </div>

                {/* Conditional Fields based on Target Type */}
                {campaignTargetType === 'custom_dept' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">เลือกหน่วยงาน (คลิกเลือกหลายรายการ)</label>
                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white space-y-1">
                      {Array.from(new Set(personnel.map(p => p.department).filter(Boolean))).map(dept => {
                        const isChecked = campaignDepts.includes(dept);
                        return (
                          <label key={dept} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setCampaignDepts(campaignDepts.filter(d => d !== dept));
                                } else {
                                  setCampaignDepts([...campaignDepts, dept]);
                                }
                              }}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span>{dept}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {campaignTargetType === 'position' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">เลือกประเภท / ตำแหน่ง</label>
                    <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white space-y-1.5">
                      {PREDEFINED_POSITIONS.map(pos => {
                        const isChecked = campaignPositions.includes(pos);
                        return (
                          <label key={pos} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setCampaignPositions(campaignPositions.filter(p => p !== pos));
                                } else {
                                  setCampaignPositions([...campaignPositions, pos]);
                                }
                              }}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span>{pos}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {campaignTargetType === 'specific_personnel' && (
                  <div className="space-y-3 bg-slate-100/50 p-3 rounded-xl border border-slate-200/50">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-slate-600 tracking-wide block uppercase">
                        ตัวช่วยกรองและเลือกรายบุคคลแบบรวดเร็ว
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setPersonnelSearchQuery('');
                          setCampaignSpecificDeptFilter('');
                          setCampaignSpecificPosFilter('');
                        }}
                        className="text-[9px] font-extrabold text-orange-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        ล้างการกรอง
                      </button>
                    </div>

                    {/* Filters Container */}
                    <div className="space-y-1.5">
                      {/* Search Input */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="ค้นหาชื่อ, รหัส, สังกัด หรือตำแหน่ง..."
                          value={personnelSearchQuery}
                          onChange={(e) => setPersonnelSearchQuery(e.target.value)}
                          className="w-full bg-white border border-slate-250 pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>

                      {/* Dropdown Filters (Dept and Pos) */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[8px] font-bold text-slate-400 block mb-0.5">แผนก/สังกัด</label>
                          <select
                            value={campaignSpecificDeptFilter}
                            onChange={(e) => setCampaignSpecificDeptFilter(e.target.value)}
                            className="w-full bg-white border border-slate-200 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-700 focus:outline-none focus:border-orange-500"
                          >
                            <option value="">ทั้งหมด</option>
                            {Array.from(new Set(personnel.map(p => p.department).filter(Boolean))).sort().map(dept => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[8px] font-bold text-slate-400 block mb-0.5">ประเภท/ตำแหน่ง</label>
                          <select
                            value={campaignSpecificPosFilter}
                            onChange={(e) => setCampaignSpecificPosFilter(e.target.value)}
                            className="w-full bg-white border border-slate-200 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-700 focus:outline-none focus:border-orange-500"
                          >
                            <option value="">ทั้งหมด</option>
                            <option value="คณบดี">คณบดี</option>
                            <option value="รองคณบดี">รองคณบดี</option>
                            <option value="ผู้อำนวยการหลักสูตร">ผู้อำนวยการหลักสูตร</option>
                            <option value="หัวหน้าภาค">หัวหน้าภาค</option>
                            <option value="หัวหน้าสาขา">หัวหน้าสาขา</option>
                            <option value="หัวหน้าหลักสูตร">หัวหน้าหลักสูตร</option>
                            <option value="ผู้ประสานงานคณะ">ผู้ประสานงานคณะ</option>
                            <option value="อาจารย์ประจำ">อาจารย์ประจำ</option>
                            <option value="อื่นๆ">อื่นๆ</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Bulk Selection Actions */}
                    {(() => {
                      const query = personnelSearchQuery.toLowerCase().trim();
                      const filteredForSelection = personnel.filter(p => {
                        const matchesSearch = !query || 
                          p.name.toLowerCase().includes(query) || 
                          p.id.toLowerCase().includes(query) ||
                          (p.email || '').toLowerCase().includes(query) ||
                          (p.position || '').toLowerCase().includes(query) ||
                          (p.department || '').toLowerCase().includes(query);

                        const matchesDept = !campaignSpecificDeptFilter || p.department === campaignSpecificDeptFilter;
                        const matchesPos = !campaignSpecificPosFilter || getPositionCategory(p.position) === campaignSpecificPosFilter;

                        return matchesSearch && matchesDept && matchesPos;
                      });

                      const selectedInFilter = filteredForSelection.filter(p => 
                        campaignCustomRecipients.some(cr => cr.id === p.id)
                      );

                      const handleSelectFilteredAll = () => {
                        const toAdd = filteredForSelection.filter(p => 
                          !campaignCustomRecipients.some(cr => cr.id === p.id)
                        );
                        if (toAdd.length > 0) {
                          setCampaignCustomRecipients(prev => [...prev, ...toAdd]);
                        }
                      };

                      const handleDeselectFilteredAll = () => {
                        const filteredIds = new Set(filteredForSelection.map(p => p.id));
                        setCampaignCustomRecipients(prev => prev.filter(cr => !filteredIds.has(cr.id)));
                      };

                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold bg-white/70 p-1.5 rounded-lg border border-slate-150">
                            <span>กรองเจอ: <strong className="text-orange-600">{filteredForSelection.length}</strong> คน</span>
                            <span>เลือกอยู่: <strong className="text-green-600">{selectedInFilter.length}</strong> คน</span>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={handleSelectFilteredAll}
                              disabled={filteredForSelection.length === 0}
                              className="flex-1 min-w-[70px] bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white font-extrabold py-1 px-1.5 rounded text-[9px] transition-all text-center flex items-center justify-center gap-0.5 cursor-pointer"
                            >
                              <span>เลือกทั้งหมด {filteredForSelection.length} คน</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleDeselectFilteredAll}
                              disabled={selectedInFilter.length === 0}
                              className="flex-1 min-w-[70px] bg-rose-50 hover:bg-rose-100 disabled:bg-slate-50 disabled:text-slate-400 text-rose-600 border border-rose-200 disabled:border-slate-150 font-extrabold py-1 px-1.5 rounded text-[9px] transition-all text-center flex items-center justify-center gap-0.5 cursor-pointer"
                            >
                              <span>ยกเลิกกลุ่มนี้</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCampaignCustomRecipients([])}
                              disabled={campaignCustomRecipients.length === 0}
                              className="bg-slate-250 hover:bg-slate-300 disabled:bg-slate-100 text-slate-600 disabled:text-slate-400 font-extrabold py-1 px-2 rounded text-[9px] transition-all text-center flex items-center justify-center cursor-pointer"
                            >
                              <span>ล้างทั้งหมด</span>
                            </button>
                          </div>

                          {/* Scrollable list with checkboxes */}
                          <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-white divide-y divide-slate-100">
                            {filteredForSelection.length === 0 ? (
                              <div className="p-4 text-xs text-slate-400 text-center">ไม่พบผลลัพธ์บุคลากรตามตัวกรอง</div>
                            ) : (
                              filteredForSelection.map(person => {
                                const isAdded = campaignCustomRecipients.some(cr => cr.id === person.id);
                                return (
                                  <label
                                    key={person.id}
                                    className="p-1.5 px-2.5 flex items-center gap-2.5 hover:bg-slate-50 transition cursor-pointer select-none"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isAdded}
                                      onChange={() => {
                                        if (isAdded) {
                                          removeCampaignRecipient(person.id);
                                        } else {
                                          addCampaignRecipient(person);
                                        }
                                      }}
                                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-3.5 w-3.5"
                                    />
                                    <div className="text-left pr-2 overflow-hidden flex-1">
                                      <div className="text-xs font-bold text-slate-800 truncate">{person.name}</div>
                                      <div className="text-[9px] text-slate-500 font-mono truncate">
                                        {person.id} • {person.position} • {person.department}
                                      </div>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {campaignTargetType === 'specific_personnel' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 block">
                        รายชื่อที่เลือกส่งเมล ({campaignCustomRecipients.length} คน)
                      </label>
                      {campaignCustomRecipients.some(cr => !cr.email || !cr.email.trim().includes('@')) && (
                        <button
                          type="button"
                          onClick={() => {
                            const withoutEmail = campaignCustomRecipients.filter(cr => !cr.email || !cr.email.trim().includes('@')).length;
                            setCampaignCustomRecipients(prev => prev.filter(cr => cr.email && cr.email.trim().includes('@')));
                            alert(`ตัดรายชื่อที่ไม่มีอีเมลออกเรียบร้อยแล้ว ${withoutEmail} คนค่ะ`);
                          }}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded cursor-pointer transition flex items-center gap-1"
                        >
                          <span>🚫 ตัดคนที่ไม่มีอีเมลออก ({campaignCustomRecipients.filter(cr => !cr.email || !cr.email.trim().includes('@')).length} คน)</span>
                        </button>
                      )}
                    </div>

                    {campaignCustomRecipients.some(cr => !cr.email || !cr.email.trim().includes('@')) && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2 animate-in fade-in duration-150">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1 text-[11px] leading-relaxed">
                          <strong>แจ้งเตือน:</strong> มีผู้รับ <strong>{campaignCustomRecipients.filter(cr => !cr.email || !cr.email.trim().includes('@')).length} คน</strong> ที่ยังไม่มีที่อยู่อีเมลในระบบ หากสั่งส่ง ระบบจะข้ามท่านเหล่านี้โดยอัตโนมัติ คุณสามารถคลิก <strong>"รายชื่อ"</strong> ด้านล่างเพื่อกรอกอีเมล หรือคลิก <strong>"ตัดคนที่ไม่มีอีเมลออก"</strong> เพื่อให้ยอดตรงกันได้ค่ะ
                        </div>
                      </div>
                    )}

                    {campaignCustomRecipients.length === 0 ? (
                      <div className="text-xs text-slate-400 italic bg-white p-3 rounded-lg text-center border border-dashed border-slate-200">
                        ยังไม่ได้เลือกบุคลากรเลยค่ะ ค้นหาและคลิกปุ่มเลือกเพื่อเพิ่มรายชื่อได้ด้านบนค่ะ
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-white">
                        {campaignCustomRecipients.map(cr => {
                          const hasEmail = cr.email && cr.email.trim().includes('@');
                          return (
                            <div 
                              key={cr.id} 
                              className={`flex items-center gap-1 border pl-2.5 pr-1.5 py-1 rounded-full text-[10px] font-semibold shadow-3xs ${
                                hasEmail ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-rose-50 border-rose-200 text-rose-800'
                              }`}
                            >
                              <span>{cr.name} ({cr.position || 'ทั่วไป'})</span>
                              {!hasEmail && (
                                <button
                                  type="button"
                                  onClick={() => setEditingQuickEmailPersonnel({ id: cr.id, name: cr.name, email: '' })}
                                  className="bg-rose-100 hover:bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded text-[9px] font-bold cursor-pointer transition"
                                  title="คลิกเพื่อกรอกอีเมลให้ท่านนี้"
                                >
                                  ⚠️ ไม่มีเมล (คลิกกรอก)
                                </button>
                              )}
                              <button
                                type="button"
                                title="ลบออกจากกลุ่มนี้"
                                onClick={() => removeCampaignRecipient(cr.id)}
                                className="text-slate-400 hover:text-rose-600 hover:bg-slate-200 rounded-full w-4 h-4 flex items-center justify-center font-bold transition cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Campaign Send Type Toggle */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">รูปแบบการจัดส่ง (Email Dispatch Method) *</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                    <button
                      type="button"
                      onClick={() => setCampaignSendType('individual')}
                      className={`py-1.5 px-2 rounded-md text-center text-xs font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                        campaignSendType === 'individual'
                          ? 'bg-white text-orange-600 shadow-2xs border border-slate-200/50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">✉️ ส่งแยกรายบุคคล</span>
                      <span className="text-[8px] opacity-75 font-normal">ระบุชื่อรายคน (เรียน อาจารย์ [ชื่อ])</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCampaignSendType('group_to');
                        setCampaignMessage(prev => 
                          prev.replace(/เรียน\s*อาจารย์\s*บุคลากรทุกท่าน/g, 'เรียน อาจารย์ทุกท่าน')
                              .replace(/เรียน\s*อาจารย์\s*และ\s*บุคลากรทุกท่าน/g, 'เรียน อาจารย์ทุกท่าน')
                              .replace(/เรียน\s*อาจารย์\s*\/\s*บุคลากรทุกท่าน/g, 'เรียน อาจารย์ทุกท่าน')
                        );
                      }}
                      className={`py-1.5 px-2 rounded-md text-center text-xs font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                        campaignSendType === 'group_to'
                          ? 'bg-white text-orange-600 shadow-2xs border border-slate-200/50'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">📬 ส่งกลุ่ม To ทุกคน</span>
                      <span className="text-[8px] opacity-75 font-normal">To ทุกคน (เรียน อาจารย์ทุกท่าน)</span>
                    </button>
                  </div>
                </div>

                {/* CC Admin Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-lg border border-slate-150/50">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-slate-700 block">สำเนาถึงผู้ดูแลระบบ (CC to Admin)</span>
                      <span className="text-[10px] text-slate-500 block">ส่งสำเนาอีเมลแคมเปญนี้เพื่อใช้เก็บหลักฐาน</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={campaignCcAdmin}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCampaignCcAdmin(checked);
                          if (checked && campaignCcEmails.length === 0 && userEmail) {
                            setCampaignCcEmails([userEmail.toLowerCase()]);
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                  </div>

                  {campaignCcAdmin && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 max-h-48 overflow-y-auto animate-fadeIn">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">เลือกรายชื่อผู้รับ CC (Admins to CC):</p>
                      {adminsList.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">ไม่พบรายชื่อแอดมินในระบบ</p>
                      ) : (
                        <div className="space-y-1.5">
                          {adminsList.map(adm => {
                            const isCurrentUser = adm.email.toLowerCase() === (userEmail || '').toLowerCase();
                            return (
                              <label key={adm.email} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors">
                                <input
                                  type="checkbox"
                                  checked={campaignCcEmails.includes(adm.email.toLowerCase())}
                                  onChange={(ev) => {
                                    const email = adm.email.toLowerCase();
                                    if (ev.target.checked) {
                                      setCampaignCcEmails(prev => [...prev, email]);
                                    } else {
                                      setCampaignCcEmails(prev => prev.filter(em => em !== email));
                                    }
                                  }}
                                  className="rounded text-orange-500 focus:ring-orange-500 h-3.5 w-3.5 border-slate-300"
                                />
                                <span className="truncate">
                                  <strong>{adm.name}</strong> <span className="text-slate-400 font-mono text-[10px]">({adm.email})</span> {isCurrentUser && <span className="ml-1 text-[10px] px-1 bg-orange-100 text-orange-700 font-bold rounded">คุณ</span>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Campaign Subject */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">หัวเรื่องจดหมาย (Email Subject) *</label>
                  <input
                    type="text"
                    required
                    value={campaignSubject}
                    onChange={(e) => setCampaignSubject(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850"
                  />
                </div>

                {/* Campaign Message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 block">เนื้อหาจดหมาย (รองรับ {"{name}"}, {"{course_title}"}, {"{speaker}"}, {"{date_time}"}) *</label>
                    <span className="text-[9px] text-orange-600 font-semibold bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                      {campaignSendType === 'individual' ? '✉️ ส่งรายบุคคล: ระบุชื่อรายคน' : '📬 ส่ง To ทุกคน: ขึ้นต้น "เรียน อาจารย์ทุกท่าน"'}
                    </span>
                  </div>

                  <textarea
                    rows={6}
                    required
                    value={campaignMessage}
                    onChange={(e) => setCampaignMessage(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850 leading-relaxed font-mono focus:ring-1 focus:ring-orange-500 focus:outline-none"
                    placeholder="พิมพ์เนื้อหาที่นี่..."
                  />
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCampaignRecipientsModal(true)}
                    className={`font-bold h-10 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer border ${
                      getCampaignRecipients().some(r => !r.email || !r.email.trim().includes('@'))
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 text-orange-600" />
                    <span className="truncate">รายชื่อ ({getCampaignRecipients().length})</span>
                    {getCampaignRecipients().some(r => !r.email || !r.email.trim().includes('@')) && (
                      <span className="bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                        ขาด {getCampaignRecipients().filter(r => !r.email || !r.email.trim().includes('@')).length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPreSendModal(true)}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold h-10 rounded-lg text-xs transition flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95"
                    title="ดูตัวอย่างการแสดงผลก่อนส่งจริง"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="truncate">👁️ ดูตัวอย่างก่อนส่ง</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowPreSendModal(true)}
                    disabled={sendingCampaignMessage || getCampaignRecipients().length === 0}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold h-10 rounded-lg text-xs shadow-sm transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {sendingCampaignMessage ? (
                      <span>กำลังจัดส่ง...</span>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span className="truncate">เริ่มส่งแคมเปญ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Panel: Live Simulated Email Preview */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm col-span-2 overflow-hidden flex flex-col justify-between" id="campaign-preview-container">
              <div className="flex-1 flex flex-col">
                <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-850 p-3.5 text-white">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-extrabold text-xs">ตัวอย่างจดหมายจริง (Live Preview)</span>
                  </div>

                  {/* Viewport Width Controls, Height Expansion & Full Preview Modal Trigger */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="bg-slate-800 p-0.5 rounded-lg flex items-center gap-1 border border-slate-700 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setPreviewViewport('desktop')}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          previewViewport === 'desktop'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="มุมมองจอคอมพิวเตอร์ (600px)"
                      >
                        💻 จอคอม
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewViewport('mobile')}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          previewViewport === 'mobile'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="มุมมองจอมือถือ (375px)"
                      >
                        📱 มือถือ
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewViewport('narrow')}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          previewViewport === 'narrow'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="มุมมองจอแคบพิเศษ (320px) สำหรับทดสอบบนจอเล็ก"
                      >
                        📱 จอแคบ
                      </button>
                    </div>

                    {/* Height & Scroll Action Helpers */}
                    <div className="bg-slate-800 p-0.5 rounded-lg flex items-center gap-0.5 border border-slate-700 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setPreviewExpandedHeight(!previewExpandedHeight)}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          previewExpandedHeight
                            ? 'bg-amber-500 text-slate-950 font-extrabold shadow-2xs'
                            : 'text-slate-300 hover:text-white'
                        }`}
                        title={previewExpandedHeight ? 'คลิกเพื่อย่อกลับเป็นกล่องเลื่อนปกติ' : 'คลิกเพื่อขยายจดหมายเต็มความยาวโดยไม่จำกัดความสูง'}
                      >
                        {previewExpandedHeight ? '↕️ ย่อความสูง' : '📏 ขยายเต็มความยาว'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (mainPreviewScrollRef.current) {
                            mainPreviewScrollRef.current.scrollTo({ top: mainPreviewScrollRef.current.scrollHeight, behavior: 'smooth' });
                          }
                        }}
                        className="px-1.5 py-0.5 rounded text-slate-300 hover:text-white transition cursor-pointer font-bold"
                        title="เลื่อนดูเนื้อหาท้ายจดหมาย"
                      >
                        ⬇️ ล่างสุด
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (mainPreviewScrollRef.current) {
                            mainPreviewScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                        className="px-1.5 py-0.5 rounded text-slate-300 hover:text-white transition cursor-pointer font-bold"
                        title="เลื่อนขึ้นบนสุด"
                      >
                        ⬆️ บนสุด
                      </button>
                    </div>
                  </div>
                </div>

                {/* Email visual envelope & typography quick bar */}
                <div className="p-3.5 bg-slate-100 border-b border-slate-200 text-xs text-slate-600 space-y-1.5 font-mono">
                  <div className="flex flex-wrap items-center justify-between gap-1 pb-1.5 border-b border-slate-250/70 text-[10px] font-sans">
                    <div className="flex items-center gap-1 text-slate-700 font-bold">
                      <span>🎨 ปรับการแสดงผล:</span>
                      <div className="inline-flex bg-white rounded border border-slate-250 p-0.5 text-[9px]">
                        {(['13px', '14px', '15px'] as const).map(size => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setEmailTextFontSize(size)}
                            className={`px-1.5 py-0.5 rounded transition ${emailTextFontSize === size ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                            title={`ขนาดตัวอักษร ${size}`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>

                      <div className="inline-flex bg-white rounded border border-slate-250 p-0.5 text-[9px]">
                        <button
                          type="button"
                          onClick={() => setEmailTextAlign('left')}
                          className={`px-1.5 py-0.5 rounded transition ${emailTextAlign === 'left' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                          title="จัดชิดซ้าย (ค่าเริ่มต้น)"
                        >
                          ชิดซ้าย
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmailTextAlign('justify')}
                          className={`px-1.5 py-0.5 rounded transition ${emailTextAlign === 'justify' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                          title="จัดกระจายเต็มบรรทัด (Thai Justified)"
                        >
                          เต็มบรรทัด
                        </button>
                      </div>

                      <div className="inline-flex bg-white rounded border border-slate-250 p-0.5 text-[9px]">
                        <button
                          type="button"
                          onClick={() => setEmailWrapMode('natural')}
                          className={`px-1.5 py-0.5 rounded transition ${emailWrapMode === 'natural' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                          title="ตัดคำตามพจนานุกรมไทยอัตโนมัติ"
                        >
                          คำไทยธรรมชาติ
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmailWrapMode('keep_all')}
                          className={`px-1.5 py-0.5 rounded transition ${emailWrapMode === 'keep_all' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                          title="ไม่แยกคำย่อย (Keep All)"
                        >
                          ไม่แยกคำ
                        </button>
                      </div>
                    </div>

                    <span className="text-[9px] text-slate-400">
                      กว้าง: {previewViewport === 'narrow' ? '320px' : previewViewport === 'mobile' ? '375px' : '600px'}
                    </span>
                  </div>

                  <p className="flex shrink-0">
                    <span className="text-slate-400 w-16">จาก:</span>
                    <strong className="text-slate-850">สำนักมาตรฐานคุณภาพการศึกษา ม.กรุงเทพ &lt;buqa@bu.ac.th&gt;</strong>
                  </p>
                  {(() => {
                    const previewList = getCampaignRecipients();
                    const hasRecipients = previewList.length > 0;
                    const safeIdx = hasRecipients ? Math.min(Math.max(0, previewRecipientIndex), previewList.length - 1) : 0;
                    const activePerson = campaignSendType === 'individual'
                      ? (hasRecipients ? previewList[safeIdx] : null)
                      : { id: 'all', name: 'ทุกท่าน', email: '', position: 'อาจารย์', department: 'มหาวิทยาลัยกรุงเทพ', phone: '', createdAt: '' };
                    const selCourse = courses.find(c => c.id === campaignCourseId) || null;

                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-400 w-16 shrink-0">ถึง:</span>
                          <div className="flex flex-wrap items-center gap-2 flex-1">
                            <span className="text-blue-700 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-100 text-xs">
                              {campaignSendType === 'individual'
                                ? (activePerson ? `${activePerson.name} <${activePerson.email || 'ไม่มีอีเมล'}>` : '[ส่งแยกรายบุคคล - ระบุชื่อตามรายชื่อผู้รับ]')
                                : '[ส่งกลุ่ม To ทุกคน - เรียน อาจารย์ทุกท่าน]'}
                            </span>
                            {campaignSendType === 'individual' && hasRecipients && (
                              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs shadow-2xs">
                                <span className="text-slate-500 text-[10px] font-bold">เลื่อนดูตัวอย่าง:</span>
                                <button
                                  type="button"
                                  onClick={() => setPreviewRecipientIndex(prev => Math.max(0, prev - 1))}
                                  disabled={safeIdx <= 0}
                                  className="px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-700 font-bold cursor-pointer"
                                  title="ผู้รับคนก่อนหน้า"
                                >
                                  ◀
                                </button>
                                <select
                                  value={safeIdx}
                                  onChange={(e) => setPreviewRecipientIndex(Number(e.target.value))}
                                  className="text-[11px] font-bold text-slate-800 bg-transparent border-0 focus:ring-0 cursor-pointer py-0 max-w-[160px] truncate"
                                >
                                  {previewList.map((r, idx) => (
                                    <option key={r.id || idx} value={idx}>
                                      #{idx + 1} {r.name} ({r.department || 'ไม่ระบุ'})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setPreviewRecipientIndex(prev => Math.min(previewList.length - 1, prev + 1))}
                                  disabled={safeIdx >= previewList.length - 1}
                                  className="px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-700 font-bold cursor-pointer"
                                  title="ผู้รับคนถัดไป"
                                >
                                  ▶
                                </button>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  ({safeIdx + 1}/{previewList.length})
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <p className="flex items-start">
                          <span className="text-slate-400 w-16">เรื่อง:</span>
                          <strong className="text-slate-900 break-words flex-1">
                            {renderTemplate(
                              campaignSubject, 
                              activePerson, 
                              selCourse,
                              campaignSendType !== 'individual'
                            )}
                          </strong>
                        </p>
                      </>
                    );
                  })()}
                </div>

                {/* Simulated Email Body Content Web Rendering */}
                {(() => {
                  const previewList = getCampaignRecipients();
                  const hasRecipients = previewList.length > 0;
                  const safeIdx = hasRecipients ? Math.min(Math.max(0, previewRecipientIndex), previewList.length - 1) : 0;
                  const activePerson = campaignSendType === 'individual'
                    ? (hasRecipients ? previewList[safeIdx] : null)
                    : { id: 'all', name: 'ทุกท่าน', email: '', position: 'อาจารย์', department: 'มหาวิทยาลัยกรุงเทพ', phone: '', createdAt: '' };
                  const selCourse = courses.find(c => c.id === campaignCourseId) || null;

                  return (
                    <div 
                      ref={mainPreviewScrollRef} 
                      className={`p-4 sm:p-6 bg-slate-50/60 overflow-y-auto overscroll-contain transition-all duration-300 flex justify-center pb-20 ${
                        previewExpandedHeight ? 'max-h-none min-h-[500px]' : 'max-h-[720px] min-h-[460px]'
                      }`}
                    >
                      <div 
                        style={{ 
                          width: previewViewport === 'narrow' ? '320px' : previewViewport === 'mobile' ? '375px' : '100%',
                          maxWidth: previewViewport === 'narrow' ? '320px' : previewViewport === 'mobile' ? '375px' : '600px'
                        }}
                        className="transition-all duration-200 border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white"
                      >
                        {/* Brand Banner */}
                        <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white p-5 text-center relative">
                          <Landmark className="h-8 w-8 text-white/90 mx-auto" />
                          <h4 className="text-xs font-mono tracking-widest text-orange-100 font-bold uppercase mt-1">Bangkok University</h4>
                          <h3 className="text-sm font-extrabold mt-1 tracking-tight">สำนักมาตรฐานคุณภาพการศึกษา</h3>
                          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white/40 animate-pulse"></div>
                        </div>

                        {/* Letter Body */}
                        <div className="p-5 space-y-4">
                          {/* Interactive personalized text rendering with proper Thai wrapping */}
                          <div 
                            className="text-slate-800 font-medium"
                            style={{
                              fontSize: emailTextFontSize,
                              textAlign: emailTextAlign,
                              lineHeight: emailLineHeight,
                              wordBreak: emailWrapMode === 'keep_all' ? 'keep-all' : 'normal',
                              overflowWrap: 'break-word',
                              lineBreak: 'loose',
                              whiteSpace: emailWrapMode === 'strict' ? 'pre-wrap' : 'normal'
                            }}
                            dangerouslySetInnerHTML={{
                              __html: renderTemplate(
                                formatMessageForHtml(campaignMessage), 
                                activePerson, 
                                selCourse,
                                campaignSendType !== 'individual'
                              )
                            }}
                          />

                      {/* Poster image fallback if not embedded inside template */}
                      {!(campaignMessage.includes('{course_poster}') || campaignMessage.includes('{course_poster_html}') || campaignMessage.includes('{course_poster_url}')) && courses.find(c => c.id === campaignCourseId)?.posterUrl && (
                        <div className="text-center my-3">
                          <img 
                            src={courses.find(c => c.id === campaignCourseId)?.posterUrl} 
                            alt="โปสเตอร์ประชาสัมพันธ์" 
                            className="max-h-72 max-w-full rounded-lg mx-auto shadow-sm border border-slate-200"
                          />
                        </div>
                      )}

                      <hr className="border-slate-100" />
                      
                      {/* Target Course Info Card Inside Mail */}
                      <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2.5 text-xs text-slate-700">
                        <p className="font-extrabold text-slate-900 border-b border-slate-100 pb-1.5 flex items-center justify-between">
                          <span>📋 สรุปรายละเอียดกำหนดการสัมมนา:</span>
                          <span className="text-[9px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-extrabold">รอบจองสิทธิ์ด่วน</span>
                        </p>
                        
                        {courses.find(c => c.id === campaignCourseId) ? (
                          <>
                            <p className="font-bold text-slate-850">
                              หัวข้อ: {courses.find(c => c.id === campaignCourseId)?.title}
                            </p>
                            <p>วิทยากรบรรยาย: 👨‍🏫 <strong>{courses.find(c => c.id === campaignCourseId)?.speaker}</strong></p>
                            <p>วันเวลาจัดสัมมนา: 📅 {courses.find(c => c.id === campaignCourseId)?.date} เวลา {courses.find(c => c.id === campaignCourseId)?.time} น.</p>
                            <p>ห้องจัดสัมมนา/โปรแกรม: 📍 {courses.find(c => c.id === campaignCourseId)?.location}</p>
                          </>
                        ) : (
                          <p className="text-slate-400 italic">กรุณาคลิกเลือกหลักสูตรเป้าหมายในคอลัมน์ด้านซ้ายมือเพื่อดึงสรุปเนื้อหา</p>
                        )}
                      </div>

                      {/* Register Dynamic Button inside email */}
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-1 min-h-[44px] cursor-default"
                        >
                          <span>👉 คลิกที่นี่เพื่อลงทะเบียนจองสิทธิ์เข้าร่วมอบรม</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="text-[10px] text-slate-400 text-center leading-normal pt-2 border-t border-slate-100">
                        จดหมายฉบับนี้ส่งถึงคุณโดยระบบอัตโนมัติภายใต้โครงข่ายความรู้ส่วนกลาง มหาวิทยาลัยกรุงเทพ<br />
                        สำนักมาตรฐานคุณภาพการศึกษา
                      </div>
                    </div>
                  </div>
                </div>
                  );
                })()}
              </div>

              {/* Real-time Dispatch Progress & System Logs */}
              {campaignProgress && (
                <div className="bg-slate-900 text-slate-200 border border-slate-850 p-5 rounded-2xl shadow-lg space-y-4 font-mono">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse"></span>
                      <h4 className="text-xs font-bold text-slate-100">ความคืบหน้าการกระจายสิทธิ์ (Invites Transmission)</h4>
                    </div>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                      {campaignProgress.sent} / {campaignProgress.total} คน
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-400 font-bold">
                      <span>ความคืบหน้าการแจกจ่าย:</span>
                      <span>{Math.round((campaignProgress.sent / campaignProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-amber-400 h-full transition-all duration-300"
                        style={{ width: `${(campaignProgress.sent / campaignProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Terminal Logger List */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400 font-bold">บันทึกขั้นตอนการส่งข้อมูลอิเล็กทรอนิกส์ (Console log):</span>
                      <button
                        type="button"
                        onClick={() => setShowCampaignLogs(!showCampaignLogs)}
                        className="text-orange-400 hover:text-orange-300 underline font-bold cursor-pointer"
                      >
                        {showCampaignLogs ? 'ย่อหน้าต่างบันทึก' : 'ขยายขอบเขตบันทึก'}
                      </button>
                    </div>

                    {showCampaignLogs && (
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] text-slate-300 max-h-40 overflow-y-auto space-y-1">
                        {campaignProgress.logs.length === 0 ? (
                          <p className="text-slate-500 italic">อยู่ระหว่างจัดส่งสารออกเข้าระบบ...</p>
                        ) : (
                          campaignProgress.logs.map((log, lidx) => (
                            <p key={lidx} className="leading-relaxed whitespace-pre-wrap">{log}</p>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Campaign Dispatch History Logs */}
          <div className="bg-white border border-slate-200/85 rounded-2xl p-6 shadow-xs mt-6 space-y-4" id="email-history-management-section">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4 gap-4">
              <div className="flex items-center gap-2">
                <div className="bg-orange-50 p-2 rounded-xl text-orange-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">ประวัติการจัดส่งจดหมายเชิญและบันทึกผู้รับ ({filteredCampaignLogs.length} รายการ)</h3>
                  <p className="text-[10px] text-slate-400">แก้ไข ลบ จัดเก็บ และจัดการข้อมูลประวัติจดหมายเชิญเข้าอบรมทางอิเล็กทรอนิกส์</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={campaignSearchQuery || ''}
                    onChange={(e) => setCampaignSearchQuery(e.target.value)}
                    placeholder="ค้นหาตามชื่อหลักสูตร, หัวข้อ..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-orange-500 w-44 min-h-[32px]"
                  />
                </div>

                {/* Filter Tabs */}
                <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
                  <button
                    onClick={() => setCampaignLogFilter('active')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      campaignLogFilter === 'active'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ใช้งานอยู่ ({campaignLogs.filter(l => !l.archived).length})
                  </button>
                  <button
                    onClick={() => setCampaignLogFilter('archived')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      campaignLogFilter === 'archived'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    จัดเก็บแล้ว ({campaignLogs.filter(l => l.archived).length})
                  </button>
                  <button
                    onClick={() => setCampaignLogFilter('all')}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md transition cursor-pointer ${
                      campaignLogFilter === 'all'
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ทั้งหมด ({campaignLogs.length})
                  </button>
                </div>

                {/* Add Manual Log Button */}
                <button
                  type="button"
                  onClick={() => {
                    const localTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    setAddCampaignForm({
                      courseId: '',
                      courseTitle: '',
                      subject: '[BU-Learning] ขอเรียนเชิญเข้าร่วมการอบรมโครงการหลักสูตร...',
                      message: 'เรียน อาจารย์ทุกท่าน,\n\nขอเรียนเชิญเข้าร่วมอบรมหลักสูตร {course_title} ในวันที่อบรม...',
                      targetType: 'all',
                      targetDetails: 'บันทึกประวัติด้วยตนเองแมนนวล',
                      recipientsCount: 0,
                      successCount: 0,
                      failCount: 0,
                      sentAt: new Date().toISOString(),
                      sentBy: userEmail || 'admin@bu.ac.th',
                      logs: []
                    });
                    setShowAddCampaignModal(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition shadow-xs flex items-center gap-1 min-h-[32px] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>บันทึกส่งแมนนวล</span>
                </button>
              </div>
            </div>

            {filteredCampaignLogs.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs italic border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                {campaignLogs.length === 0 
                  ? 'ยังไม่มีการบันทึกประวัติการส่งจดหมายอบรมในระบบเลยค่ะ' 
                  : 'ไม่พบประวัติการจัดส่งตามตัวกรองหรือคำค้นหานี้ค่ะ'}
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-150 rounded-xl bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-150">
                      <th className="p-3 font-semibold text-[11px]">วันเวลาที่จัดส่ง (Sent At)</th>
                      <th className="p-3 font-semibold text-[11px]">หลักสูตรอบรม (Course Activity)</th>
                      <th className="p-3 font-semibold text-[11px]">หัวข้ออีเมล (Subject Line)</th>
                      <th className="p-3 font-semibold text-[11px]">กลุ่มเป้าหมาย (Target Group)</th>
                      <th className="p-3 font-semibold text-[11px] text-center">สถิติการจัดส่ง (Success Rate)</th>
                      <th className="p-3 font-semibold text-[11px] text-center">สถานะ</th>
                      <th className="p-3 font-semibold text-[11px] text-center">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-750">
                    {filteredCampaignLogs.map((log) => {
                      const successPercent = log.recipientsCount > 0 ? Math.round((log.successCount / log.recipientsCount) * 100) : 0;
                      const formattedDate = new Date(log.sentAt).toLocaleString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      });

                      const isExpanded = selectedCampaignLogIdForDetails === log.id;
                      const displaySubject = (log.subject || '').replace(/{course_title}/g, log.courseTitle || '');
                      const failedList = getFailedRecipientsFromLog(log);

                      return (
                        <React.Fragment key={log.id}>
                          <tr className={`hover:bg-slate-50/50 transition ${log.archived ? 'opacity-60 bg-slate-50/20' : ''}`}>
                            <td className="p-3 font-semibold text-slate-655 font-mono whitespace-nowrap">{formattedDate} น.</td>
                            <td className="p-3 font-bold text-slate-800 max-w-xs truncate" title={log.courseTitle}>
                              {log.courseTitle}
                            </td>
                            <td className="p-3 text-slate-600 max-w-xs truncate" title={displaySubject}>
                              {displaySubject}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold">
                                {log.targetDetails}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-extrabold text-slate-800 text-[11px]">
                                  {log.successCount} / {log.recipientsCount} สำเร็จ
                                </span>
                                <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${successPercent === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                                    style={{ width: `${successPercent}%` }}
                                  ></div>
                                </div>
                                <span className="text-[9px] text-slate-400">({successPercent}%)</span>
                                {log.successCount < log.recipientsCount && (
                                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                                    ⚠️ ไม่สำเร็จ {log.recipientsCount - log.successCount} คน
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              {log.archived ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200 rounded-md">
                                  📁 จัดเก็บแล้ว
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] font-bold bg-green-50 text-green-700 border border-green-100 rounded-md">
                                  🟢 ใช้งานอยู่
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                {log.successCount < log.recipientsCount && (
                                  <button
                                    type="button"
                                    title="ส่งซ้ำเฉพาะผู้ที่จัดส่งไม่สำเร็จหรือไม่มีอีเมล"
                                    onClick={() => handleRetryFailedRecipients(log)}
                                    className="px-2 py-1 text-[10px] font-extrabold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-md transition duration-150 flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                                  >
                                    <RotateCw className="h-3 w-3 text-rose-600" />
                                    <span>ส่งซ้ำ ({log.recipientsCount - log.successCount})</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  title="ดึงรายชื่อกลุ่มนี้สำหรับการส่งครั้งต่อไป"
                                  onClick={() => handleReuseCampaignTargetGroup(log)}
                                  className="px-2 py-1 text-[10px] font-extrabold text-orange-700 bg-orange-100 hover:bg-orange-200 border border-orange-250 hover:border-orange-300 rounded-md transition duration-150 flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                                >
                                  <Users className="h-3 w-3 text-orange-600" />
                                  <span>ดึงกลุ่มนี้</span>
                                </button>

                                <button
                                  type="button"
                                  title="ดูบันทึกส่ง"
                                  onClick={() => setSelectedCampaignLogIdForDetails(isExpanded ? null : log.id)}
                                  className={`px-2 py-1 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                                    isExpanded 
                                      ? 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700' 
                                      : 'text-orange-600 bg-orange-50 border-orange-100 hover:bg-orange-100'
                                  }`}
                                >
                                  {isExpanded ? 'ย่อบันทึก' : 'ดูบันทึก'}
                                </button>
                                
                                <button
                                  type="button"
                                  title="แก้ไขประวัติ"
                                  onClick={() => handleStartEditCampaignLog(log)}
                                  className="p-1.5 text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-100 transition cursor-pointer"
                                >
                                  <Edit className="h-3 w-3" />
                                </button>

                                <button
                                  type="button"
                                  title={log.archived ? 'เลิกจัดเก็บ' : 'จัดเก็บ'}
                                  onClick={() => handleToggleArchiveCampaignLog(log)}
                                  className="p-1.5 text-[10px] text-slate-600 bg-slate-50 hover:bg-slate-150 rounded-md border border-slate-200 transition cursor-pointer"
                                >
                                  <Archive className="h-3 w-3" />
                                </button>

                                <button
                                  type="button"
                                  title="ลบออกจากระบบอย่างถาวร"
                                  onClick={() => handleDeleteCampaignLog(log.id)}
                                  className="p-1.5 text-[10px] text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-100 transition cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-slate-50/70 p-4 border-t border-b border-slate-150">
                                <div className="space-y-3 font-mono text-[10px] text-slate-700">
                                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded-xl border border-slate-200 gap-3">
                                    <div>
                                      <p>👨‍💻 <strong>ผู้ดำเนินการส่ง:</strong> {log.sentBy}</p>
                                      <p className="mt-1">
                                        📦 <strong>ความต้องการสำเร็จ/ล้มเหลว:</strong> สำเร็จ {log.successCount} | ล้มเหลว/ไม่มีอีเมล {log.recipientsCount - log.successCount} (รวม {log.recipientsCount} คน)
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {log.successCount < log.recipientsCount && (
                                        <button
                                          type="button"
                                          onClick={() => handleRetryFailedRecipients(log)}
                                          className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs rounded-lg shadow-sm transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                        >
                                          <RotateCw className="h-4 w-4" />
                                          <span>ส่งซ้ำเฉพาะผู้ที่ไม่สำเร็จ ({log.recipientsCount - log.successCount} คน)</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        id={`btn-reuse-target-${log.id}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleReuseCampaignTargetGroup(log);
                                        }}
                                        className="w-full md:w-auto px-3.5 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-extrabold text-xs rounded-lg shadow-sm transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                        title="คลิกเพื่อนำกลุ่มเป้าหมายนี้ไปตั้งค่าส่งจดหมายเชิญในฟอร์มด้านบน"
                                      >
                                        <Users className="h-4 w-4" />
                                        <span>ใช้กลุ่มเป้าหมายทั้งหมด ({log.recipientsCount} คน)</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* List of failed recipients if any */}
                                  {failedList.length > 0 && (
                                    <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3.5 space-y-2.5">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <h5 className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                                          <span>รายชื่อผู้รับที่จัดส่งไม่สำเร็จ / ไม่มีอีเมล ({failedList.length} คน):</span>
                                        </h5>
                                        <button
                                          type="button"
                                          onClick={() => handleRetryFailedRecipients(log)}
                                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-lg shadow-xs flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 self-start sm:self-auto"
                                        >
                                          <RotateCw className="h-3.5 w-3.5" />
                                          <span>โหลดเฉพาะกลุ่มนี้เพื่อส่งซ้ำทันที</span>
                                        </button>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                        {failedList.map((f, fidx) => (
                                          <div key={f.id || fidx} className="bg-white p-2.5 rounded-lg border border-rose-200/80 shadow-3xs flex flex-col justify-between text-[11px]">
                                            <div>
                                              <div className="font-bold text-slate-850 flex items-center justify-between">
                                                <span className="truncate pr-1">{f.name}</span>
                                                <span className="text-[9px] text-rose-600 font-bold shrink-0">{f.reason || 'ส่งไม่สำเร็จ'}</span>
                                              </div>
                                              <div className="text-[10px] text-slate-500 mt-0.5 truncate">{f.department || 'ไม่ระบุสังกัด'}</div>
                                              <div className="text-[10px] mt-1 font-mono">
                                                {f.email ? (
                                                  <span className="text-slate-600 truncate block">{f.email}</span>
                                                ) : (
                                                  <span className="text-rose-600 font-bold">⚠️ ไม่มีที่อยู่อีเมลในระบบ</span>
                                                )}
                                              </div>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingQuickEmailPersonnel({ id: f.id, name: f.name, email: f.email || '', department: f.department });
                                              }}
                                              className="mt-2 text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 py-1 px-2 rounded font-semibold text-center border border-blue-200/60 transition cursor-pointer"
                                            >
                                              ✏️ {f.email ? 'แก้ไขอีเมล' : 'กรอกอีเมลให้ท่านนี้'}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <div className="bg-slate-950 p-3 rounded-lg text-slate-300 max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                                    <h4 className="text-orange-400 font-bold text-[11px] mb-1.5 pb-1 border-b border-slate-800">รายละเอียดสถานะส่งเมลเชิญรายบุคคล:</h4>
                                    {log.logs && log.logs.length > 0 ? (
                                      log.logs.map((logLine, lidx) => (
                                        <p key={lidx} className="leading-relaxed whitespace-pre-wrap">{logLine}</p>
                                      ))
                                    ) : (
                                      <p className="text-slate-500 italic">ไม่มีบันทึกรายละเอียดประวัติ</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'evaluations' ? (
        /* EVALUATIONS TAB (ผลการประเมินและการจัดการแบบสำรวจ) */
        <div className="space-y-6" id="evaluations-tab-content">
          {/* Inner tab navigation */}
          <div className="bg-slate-50 border border-slate-200/60 p-1.5 rounded-xl flex gap-1 w-fit">
            <button
              onClick={() => setEvaluationSubTab('report')}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                evaluationSubTab === 'report'
                  ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Award className="h-4 w-4 text-orange-500" />
              <span>ผลประเมินและการวิเคราะห์ (Report & Analysis)</span>
            </button>
            <button
              onClick={() => setEvaluationSubTab('manage')}
              className={`px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                evaluationSubTab === 'manage'
                  ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="h-4 w-4 text-orange-500" />
              <span>จัดการข้อคำถามแบบประเมิน (Manage Questions)</span>
            </button>
          </div>

          {evaluationSubTab === 'manage' ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-8 animate-in fade-in duration-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-850 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-orange-500" />
                    <span>ตั้งค่าแบบสอบถามความพึงพอใจส่วนบุคคล</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    กำหนดและจัดสรรโครงสร้างแบบประเมินผู้เข้าอบรม สามารถเพิ่ม ลบ และเรียงข้อคำถามได้แบบเรียลไทม์
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      requestConfirmation(
                        'คืนค่าเริ่มต้นคำถามประเมิน',
                        'คุณแน่ใจว่าต้องการรีเซ็ตคำถามการประเมินทั้งหมดกลับเป็นค่าเริ่มต้นดั้งเดิมของสถาบันใช่หรือไม่คะ?',
                        () => {
                          setEvaluationConfig(DEFAULT_EVALUATION_CONFIG);
                          handleSaveEvaluationConfig(DEFAULT_EVALUATION_CONFIG);
                        }
                      );
                    }}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl text-xs transition relative min-h-[38px] cursor-pointer"
                  >
                    คืนค่าเริ่มต้นดั้งเดิม
                  </button>
                  <button
                    onClick={() => handleSaveEvaluationConfig(evaluationConfig)}
                    disabled={savingEvalConfig}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 min-h-[38px] cursor-pointer"
                  >
                    {savingEvalConfig ? (
                      <span>กำลังบันทึกโครงสร้าง...</span>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>บันทึกแบบประเมิน</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {saveEvalConfigSuccess && (
                <div className="bg-emerald-50 border border-emerald-150 p-3.5 rounded-xl text-xs font-bold text-emerald-850 flex items-center gap-2 animate-pulse">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>บันทึกหัวข้อข้อประเมินความพึงพอใจขึ้นระบบคลาวด์เรียบร้อยแล้วค่ะ! ผู้เข้าอบรมจะเห็นฟอร์มใหม่นี้ทันที</span>
                </div>
              )}

              {/* Select Target Course to Edit */}
              <div className="bg-orange-50/40 border border-orange-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-orange-600 block uppercase tracking-wider">
                    เป้าหมายการตั้งค่า (Configuration Target)
                  </label>
                  <span className="text-xs font-black text-slate-850">
                    เลือกการอบรมที่คุณต้องการออกแบบคำถามประเมินเฉพาะตัว
                  </span>
                </div>
                <div className="min-w-[320px]">
                  <select
                    value={evalTargetCourseId}
                    onChange={(e) => setEvalTargetCourseId(e.target.value)}
                    className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl p-2.5 focus:ring-1 focus:ring-orange-500 focus:outline-none transition cursor-pointer"
                  >
                    <option value="global">📣 แบบประเมินมาตรฐานกลาง (ใช้กับทุกหลักสูตรทั่วไป)</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.archived ? '📦 ' : '✨ '} {c.title} ({c.speaker})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {evalTargetCourseId !== 'global' && (() => {
                const targetCourse = courses.find(c => c.id === evalTargetCourseId);
                const hasCustom = !!targetCourse?.customEvaluationConfig;
                if (!hasCustom) {
                  return (
                    <div className="bg-sky-50 border border-sky-100 p-4 rounded-xl text-xs text-sky-850 flex items-start gap-2 animate-fadeIn">
                      <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
                      <div>
                        <strong className="block font-bold">💡 หลักสูตรนี้กำลังใช้คำถามมาตรฐานกลาง (ไม่มีแบบประเมินเฉพาะตัว):</strong>
                        <p className="mt-0.5">คุณสามารถปรับแต่ง แก้ไข หรือเพิ่ม/ลบ คำถามด้านล่างนี้ได้เลยค่ะ เมื่อคุณกด <strong>"บันทึกแบบประเมิน"</strong> ระบบจะคัดลอกจากคำถามมาตรฐานกลางและบันทึกเป็นแบบประเมินเฉพาะตัวของหลักสูตรนี้ให้โดยอัตโนมัติ (ไม่กระทบหลักสูตรอื่น)</p>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-xs text-emerald-850 flex items-start gap-2 animate-fadeIn">
                      <Sparkles className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <strong className="block font-bold">✨ หลักสูตรนี้มี "แบบประเมินเฉพาะตัว" แล้ว:</strong>
                        <p className="mt-0.5">ข้อคำถามที่แสดงอยู่ด้านล่างนี้เป็นแบบประเมินเฉพาะตัวของหลักสูตรนี้โดยเฉพาะ คุณสามารถบันทึกแก้ไขได้ทันทีค่ะ</p>
                      </div>
                    </div>
                  );
                }
              })()}

              {/* PART 1 */}
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <span className="text-[10px] bg-slate-100 text-slate-705 px-2.5 py-0.5 rounded font-black font-sans">PART 1</span>
                  <h4 className="text-sm font-extrabold text-slate-800 mt-0.5">ส่วนที่ 1: ข้อมูลทั่วไป (สังกัดของผู้เข้าอบรม)</h4>
                  <p className="text-xs text-slate-450">กำหนดรายชื่อของคณะหรือสถาบันที่เปิดให้ผู้ประเมินคลิกเลือกสังกัด</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <div className="space-y-3">
                    <label className="text-xs font-extrabold text-slate-700 block">รายชื่อคณะ/หน่วยงานปัจจุบัน ({evaluationConfig.part1Affiliations.length} สังกัด)</label>
                    <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1 bg-white border border-slate-200 rounded-xl p-3">
                      {evaluationConfig.part1Affiliations.map((aff, idx) => (
                        <div key={idx} className="flex items-center gap-2 border-b border-slate-50 last:border-0 pb-1.5 last:pb-0">
                          <span className="text-[10px] text-slate-400 font-mono font-bold w-5">{idx + 1}.</span>
                          <input
                            type="text"
                            value={aff}
                            onChange={(e) => {
                              const updated = [...evaluationConfig.part1Affiliations];
                              updated[idx] = e.target.value;
                              setEvaluationConfig({ ...evaluationConfig, part1Affiliations: updated });
                            }}
                            className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none focus:bg-slate-50 px-1.5 py-1 rounded flex-1 border border-transparent focus:border-slate-200"
                          />
                          <button
                            onClick={() => {
                              const updated = evaluationConfig.part1Affiliations.filter((_, i) => i !== idx);
                              setEvaluationConfig({ ...evaluationConfig, part1Affiliations: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                            title="ลบสังกัดนี้"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="พิมพ์สังกัดใหม่ (เช่น คณะอักษรศาสตร์)..."
                        id="new-aff-inner"
                        className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500 flex-1 min-h-[36px]"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) {
                              setEvaluationConfig({
                                ...evaluationConfig,
                                part1Affiliations: [...evaluationConfig.part1Affiliations, val]
                              });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const el = document.getElementById('new-aff-inner') as HTMLInputElement;
                          const val = el?.value?.trim();
                          if (val) {
                            setEvaluationConfig({
                              ...evaluationConfig,
                              part1Affiliations: [...evaluationConfig.part1Affiliations, val]
                            });
                            el.value = '';
                          }
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold px-4 cursor-pointer min-h-[36px]"
                      >
                        เพิ่มสังกัด
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 flex flex-col justify-between">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                      <h5 className="text-xs font-extrabold text-slate-805">ตัวชี้วัดเสริมสังกัด อื่นๆ</h5>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEvaluationConfig({
                            ...evaluationConfig,
                            enableOtherAffiliation: !evaluationConfig.enableOtherAffiliation
                          })}
                          className="focus:outline-none cursor-pointer"
                        >
                          {evaluationConfig.enableOtherAffiliation ? (
                            <ToggleRight className="h-9 w-9 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-9 w-9 text-slate-350" />
                          )}
                        </button>
                        <div>
                          <span className="text-xs font-extrabold text-slate-805 block">เปิดช่องกรอกสังกัด "อื่นๆ (ระบุเพิ่มเติม)"</span>
                          <span className="text-[10px] text-slate-400">อนุญาตให้ผู้ประเมินคลิกเลือก 'อื่นๆ โปรดระบุ' ได้</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-dashed border-slate-200 rounded-xl p-4 text-[11px] text-slate-500 leading-relaxed bg-white/45">
                      💡 สังกัดหน่วยงานของบุคลากรจะเอื้อประโยชน์ให้สถาบันสามารถประมวลผลความใส่ใจรายสังกัดได้อย่างง่ายดายค่ะ
                    </div>
                  </div>
                </div>
              </div>

              {/* PART 2 */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="border-b border-slate-100 pb-2">
                  <span className="text-[10px] bg-slate-100 text-slate-705 px-2.5 py-0.5 rounded font-black font-sans">PART 2</span>
                  <h4 className="text-sm font-extrabold text-slate-800 mt-0.5">ส่วนที่ 2: ความเข้าใจในเนื้อหาการสอนก่อนและหลังจากสัมมนา</h4>
                  <p className="text-xs text-slate-450">ปรับแต่งข้อคําถามสเกลคะแนนความพึงพอใจด้านระดับความก้าวหน้าและการยกระดับวิชาการ</p>
                </div>

                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-550 block">🔴 คำถามก่อนเข้ารับการอบรม (Before Training Label)</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500 min-h-[38px]"
                      value={evaluationConfig.part2BeforeLabel}
                      onChange={(e) => setEvaluationConfig({ ...evaluationConfig, part2BeforeLabel: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-550 block">🔴 คำถามหลังเสร็จสิ้นการอบรม (After Training Label)</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500 min-h-[38px]"
                      value={evaluationConfig.part2AfterLabel}
                      onChange={(e) => setEvaluationConfig({ ...evaluationConfig, part2AfterLabel: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* PART 3 */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="border-b border-slate-100 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] bg-slate-100 text-slate-705 px-2.5 py-0.5 rounded font-black font-sans">PART 3</span>
                    <h4 className="text-sm font-extrabold text-slate-800 mt-0.5">ส่วนที่ 3: ระดับความพึงพอใจและการประเมินจัดการโครงการ</h4>
                    <p className="text-xs text-slate-450">แก้ไขสาระ เพิ่ม ลบ ฟอร์มสเกลวัดตั้งแต่ระดับ (1-5 ดาว) จนถึงการพิมพ์คำแนะนำอิสระ</p>
                  </div>
                  <button
                    onClick={() => {
                      const newId = `q_${Date.now()}`;
                      const newQ: SurveyQuestion = {
                        id: newId,
                        text: 'หัวข้อใหม่สำหรับวัดความพึงพอใจในการจัดการเรียนรู้*',
                        type: 'rating',
                        required: true
                      };
                      setEvaluationConfig({
                        ...evaluationConfig,
                        part3Questions: [...evaluationConfig.part3Questions, newQ]
                      });
                    }}
                    className="self-start sm:self-center px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-1.5 min-h-[36px] cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>เพิ่มข้อคำถามอบรม</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {evaluationConfig.part3Questions.map((q, idx) => (
                    <div key={q.id} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 w-full md:w-auto flex-1">
                        <span className="text-xs font-black text-slate-400 font-mono bg-white h-7 w-7 rounded-lg border border-slate-150 flex items-center justify-center shadow-3xs">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={q.text}
                          onChange={(e) => {
                            const updated = [...evaluationConfig.part3Questions];
                            updated[idx] = { ...q, text: e.target.value };
                            setEvaluationConfig({ ...evaluationConfig, part3Questions: updated });
                          }}
                          className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-orange-500 flex-1 min-h-[36px]"
                        />
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto font-sans">
                        <div className="space-y-0.5">
                          <label className="text-[9px] font-bold text-slate-400 block tracking-normal">ประเภท</label>
                          <select
                            value={q.type}
                            onChange={(e) => {
                              const updated = [...evaluationConfig.part3Questions];
                              updated[idx] = { ...q, type: e.target.value as 'rating' | 'text' };
                              setEvaluationConfig({ ...evaluationConfig, part3Questions: updated });
                            }}
                            className="bg-white border border-slate-150 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-705 focus:outline-none cursor-pointer"
                          >
                            <option value="rating">⭐ 1-5 ดาวประเมิน</option>
                            <option value="text">✏️ พิมพ์ตอบแสดงความเห็น</option>
                          </select>
                        </div>

                        <div className="space-y-0.5">
                          <label className="text-[9px] font-bold text-slate-400 block text-center">ต้องกรอก</label>
                          <button
                            onClick={() => {
                              const updated = [...evaluationConfig.part3Questions];
                              updated[idx] = { ...q, required: !q.required };
                              setEvaluationConfig({ ...evaluationConfig, part3Questions: updated });
                            }}
                            className="focus:outline-none"
                          >
                            {q.required ? (
                              <span className="inline-flex px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded border border-rose-200 cursor-pointer">ใช่</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded border border-slate-200 cursor-pointer">ไม่</span>
                            )}
                          </button>
                        </div>

                        <div className="flex gap-1">
                          <button
                            disabled={idx === 0}
                            onClick={() => {
                              const updated = [...evaluationConfig.part3Questions];
                              const temp = updated[idx];
                              updated[idx] = updated[idx - 1];
                              updated[idx - 1] = temp;
                              setEvaluationConfig({ ...evaluationConfig, part3Questions: updated });
                            }}
                            className="p-1 px-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 text-[10px] font-black cursor-pointer"
                          >
                            ▲
                          </button>
                          <button
                            disabled={idx === evaluationConfig.part3Questions.length - 1}
                            onClick={() => {
                              const updated = [...evaluationConfig.part3Questions];
                              const temp = updated[idx];
                              updated[idx] = updated[idx + 1];
                              updated[idx + 1] = temp;
                              setEvaluationConfig({ ...evaluationConfig, part3Questions: updated });
                            }}
                            className="p-1 px-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-30 text-[10px] font-black cursor-pointer"
                          >
                            ▼
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            const updated = evaluationConfig.part3Questions.filter((_, i) => i !== idx);
                            setEvaluationConfig({ ...evaluationConfig, part3Questions: updated });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-2 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                          title="ลบข้อคำถามข้อนี้"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col xl:flex-row justify-between xl:items-center gap-6 animate-in fade-in duration-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center w-fit gap-1">
                      Evaluation Report & Analysis
                    </span>
                    <span className="bg-slate-100 text-slate-650 text-[10px] font-extrabold px-2 py-0.5 rounded-md">
                      ผลตอบรับประเมินจริง {registrations.filter(r => r.courseId === selectedCourseId && r.feedback).length} รายการ
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-800">คลังผลประเมินจากการอบรมคณาจารย์</h2>
                  <p className="text-xs text-slate-450 font-medium leading-relaxed">
                    วิเคราะห์ผลสัมฤทธิ์ คุณภาพการสอน คะแนนส่งแนะส่งต่อ และความคิดเห็นข้อคิดป้อนกลับสำหรับหลักสูตรโครงการพัฒนาคณาจารย์
                  </p>
                </div>

                {/* Course Selector Dropdown */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">เลือกหลักสูตรประเมิน</label>
                    <select
                      value={selectedCourseId}
                      onChange={(e) => setSelectedCourseId(e.target.value)}
                      className="bg-white border border-slate-200 p-2.5 rounded-xl text-xs font-extrabold focus:outline-none focus:border-orange-500 min-w-[280px] cursor-pointer text-slate-800"
                    >
                      <option value="">-- กรุณาเลือกหลักสูตรที่ต้องการวิเคราะห์ --</option>
                      {courses.filter(c => !c.archived || c.id === selectedCourseId || showArchivedInDropdown).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.archived ? '📁 [จัดเก็บแล้ว] ' : ''}{c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showArchivedInDropdown}
                      onChange={(e) => setShowArchivedInDropdown(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 cursor-pointer"
                    />
                    <span>แสดงหลักสูตรที่จัดเก็บแล้ว ({courses.filter(c => c.archived).length})</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleDownloadEvaluations}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition shadow-sm cursor-pointer min-h-[38px]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>ดึงข้อมูลผลประเมิน (CSV)</span>
                  </button>
                </div>
              </div>

              {/* KPI Analytics Cards */}
              {(() => {
                const courseRegs = registrations.filter(r => r.courseId === selectedCourseId);
                const feedList = courseRegs.filter(r => r.feedback);
                const totalFeeds = feedList.length;

                const avgSat = totalFeeds > 0 
                  ? (feedList.reduce((acc, curr) => acc + (curr.feedback?.satisfaction || 0), 0) / totalFeeds).toFixed(2)
                  : '-';

                const avgRec = totalFeeds > 0 
                  ? (feedList.reduce((acc, curr) => acc + (curr.feedback?.recommendation || 0), 0) / totalFeeds).toFixed(2)
                  : '-';

                const checkInCount = courseRegs.filter(r => r.checkedIn).length;
                const completionRate = checkInCount > 0 ? Math.ceil((totalFeeds / checkInCount) * 100) : 0;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="evaluations-stats-grid">
                    <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">ปริมาณส่งแบบประเมิน</span>
                      <div className="flex justify-between items-baseline mt-4">
                        <span className="text-2xl font-black text-slate-800">{totalFeeds} ใบตอบกลับ</span>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          จากผู้เช็คอิน {checkInCount} คน
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">ความพึงพอใจเฉลี่ย</span>
                      <div className="flex justify-between items-baseline mt-4">
                        <span className="text-2xl font-black text-amber-500">★ {avgSat} / 5.0</span>
                        <span className="text-[10px] font-bold text-slate-400">เกณฑ์เฉลี่ย</span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">ดัชนีส่งแนะแนะต่อ</span>
                      <div className="flex justify-between items-baseline mt-4">
                        <span className="text-2xl font-black text-blue-600">❤ {avgRec} / 5.0</span>
                        <span className="text-[10px] font-semibold text-slate-400">Recommendation</span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">ความร่วมมือส่งประเมิน</span>
                      <div className="flex justify-between items-baseline mt-4">
                        <span className="text-2xl font-black text-emerald-600">{completionRate}%</span>
                        <span className="text-[10px] font-bold text-slate-400">Response Rate</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Evaluations detailed comments */}
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-extrabold text-slate-955 flex items-center gap-1.5 border-b border-slate-50 pb-3">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <span>ประวัติผู้ส่งแบบสำรวจความพึงพอใจและคำแนะนำเพิ่มเติม</span>
                </h3>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/60 text-[11px] font-black uppercase text-slate-500 border-b border-slate-100">
                        <th className="py-3 px-4 text-center w-16">ลำดับ</th>
                        <th className="py-3 px-3 w-32">รหัสบุคลากร</th>
                        <th className="py-3 px-3">ชื่อ-นามสกุล</th>
                        <th className="py-3 px-3">สังกัดที่ตอบกลับ</th>
                        <th className="py-3 px-3 text-center w-28">ความเข้าใจก่อน</th>
                        <th className="py-3 px-3 text-center w-28">ความเข้าใจหลัง</th>
                        <th className="py-3 px-3 text-center w-28">คะแนนพึงพอใจ</th>
                        <th className="py-3 px-4 text-center w-36">การตอบสนอง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {(() => {
                        const matchedRefs = registrations
                          .filter(r => r.courseId === selectedCourseId && r.feedback)
                          .sort((a, b) => {
                            const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
                            const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
                            return timeA - timeB;
                          });
                        if (matchedRefs.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="py-12 text-center text-slate-400 italic font-medium">
                                ยังไม่มีผลประเมินพึงพอใจสัมมนาส่งเข้ามาสำหรับหลักสูตรวิชานี้ค่ะ
                              </td>
                            </tr>
                          );
                        }
                        return matchedRefs.map((m, idx) => {
                          const affiliationDisplay = m.feedback?.affiliation === 'อื่นๆ' && m.feedback?.affiliationOther
                            ? `อื่นๆ (${m.feedback.affiliationOther})`
                            : (m.feedback?.affiliation || m.department);
                          return (
                            <tr key={m.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                              <td className="py-3 px-3 font-mono font-bold text-slate-800">{m.personnelId}</td>
                              <td className="py-3 px-3 font-semibold text-slate-900">{m.name}</td>
                              <td className="py-3 px-3 text-slate-500">{affiliationDisplay}</td>
                              <td className="py-3 px-3 text-center">
                                <span className={`font-bold px-2 py-0.5 rounded ${m.feedback?.part2Before && m.feedback.part2Before >= 4 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                                  {m.feedback?.part2Before || '-'}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className={`font-bold px-2 py-0.5 rounded ${m.feedback?.part2After && m.feedback.part2After >= 4 ? 'bg-emerald-100 text-emerald-800' : m.feedback?.part2After && m.feedback.part2After > (m.feedback?.part2Before || 0) ? 'bg-orange-50 text-orange-700' : 'bg-slate-50 text-slate-600'}`}>
                                  {m.feedback?.part2After || '-'}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="font-bold text-amber-500">
                                  ★ {m.feedback?.satisfaction} / 5
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDetailedFeedback(m)}
                                  className="text-xs font-bold text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-200 hover:border-orange-600 px-3 py-1.5 rounded-lg transition shadow-3xs cursor-pointer"
                                >
                                  ดูข้อมูลประเมินครบ
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Detailed answers dialog modal overlay */}
          {selectedDetailedFeedback && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[999] animate-in fade-in duration-250">
              <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-6 animate-in slide-in-from-bottom-6 duration-300">
                <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">ผลสรุปแบบประเมินส่วนประกอบผู้เข้าอบรม</h3>
                    <p className="text-xs text-slate-450 mt-1">ผู้ตอบ: {selectedDetailedFeedback.name} ({selectedDetailedFeedback.personnelId})</p>
                  </div>
                  <button
                    onClick={() => setSelectedDetailedFeedback(null)}
                    className="p-1 px-3 text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer transition"
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>

                <div className="space-y-4">
                  {/* PART 1 */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ส่วนที่ 1: สังกัดหน่วยงานที่ประเมิน</span>
                    <p className="text-xs bg-slate-50 border border-slate-150 p-3 rounded-xl font-bold text-slate-800">
                      {selectedDetailedFeedback.feedback?.affiliation === 'อื่นๆ' && selectedDetailedFeedback.feedback?.affiliationOther
                        ? `อื่นๆ (${selectedDetailedFeedback.feedback.affiliationOther})`
                        : (selectedDetailedFeedback.feedback?.affiliation || selectedDetailedFeedback.department)}
                    </p>
                  </div>

                  {/* PART 2 */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ส่วนที่ 2: ความรู้ความเข้าใจก่อนและหลังอบรม (ความเข้าใจเฉลี่ย)</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl">
                        <span className="text-[10px] font-medium text-slate-400 block">ก่อนรับการอบรม</span>
                        <span className="text-lg font-black text-slate-800">★ {selectedDetailedFeedback.feedback?.part2Before || '-'} / 5</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl">
                        <span className="text-[10px] font-medium text-slate-400 block">หลังได้รับการอบรม</span>
                        <span className="text-lg font-black text-emerald-700">★ {selectedDetailedFeedback.feedback?.part2After || '-'} / 5</span>
                      </div>
                    </div>
                  </div>

                  {/* PART 3 */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ส่วนที่ 3: ความพึงพอใจจำแนกรายละเอียดคำถาม</span>
                    <div className="space-y-2.5 bg-slate-50 border border-slate-150 p-4 rounded-2xl max-h-[300px] overflow-y-auto">
                      {(() => {
                        const feedbackCourse = courses.find(c => c.id === selectedDetailedFeedback.courseId);
                        const feedbackEvalConfig = feedbackCourse?.customEvaluationConfig || globalEvaluationConfig;
                        return feedbackEvalConfig.part3Questions.map((q, idx) => {
                          const answerValue = selectedDetailedFeedback.feedback?.answers?.[q.id] 
                            ?? (q.id === 'q1' ? selectedDetailedFeedback.feedback?.satisfaction : undefined)
                            ?? (q.id === 'q8' ? selectedDetailedFeedback.feedback?.satisfaction : undefined)
                            ?? (q.id === 'q9' ? selectedDetailedFeedback.feedback?.comments : undefined);

                          return (
                            <div key={q.id} className="border-b border-slate-100 last:border-0 pb-2.5 last:pb-0">
                              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-slate-400">{idx + 1}.</span>
                                <span>{q.text}</span>
                              </span>
                              <div className="mt-1">
                                {q.type === 'rating' ? (
                                  <span className="text-xs font-black text-amber-500">
                                    ★ {answerValue ? `${answerValue} / 5` : <span className="text-slate-350 italic font-normal">- ไม่ได้ระบุระดับคะแนน -</span>}
                                  </span>
                                ) : (
                                  <p className="text-xs text-slate-600 bg-white/70 px-2.5 py-1.5 rounded-lg border border-slate-100 italic leading-relaxed">
                                    {answerValue ? `"${answerValue}"` : <span className="text-slate-305 font-mono italic">- ว่าง -</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* MANAGE WEB SERVICE EMAIL SETTINGS (GAS CONFIG) */
        <div className="space-y-6" id="settings-tab-content">
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 max-w-3xl space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                <Settings className="h-5.5 w-5.5 text-orange-600" />
                <span>กำหนดช่องทางเว็บบริการส่งเมล (Google Apps Script Integration)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                การส่งอีเมล์ยืนยันไปหาบุคลากรฟรี 100% จำเป็นต้องมีการเชื่อมโยง API ไปยัง Google Apps Script ที่ติดตั้งภายใต้โดเมนของคุณ
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">ป้อน Google Apps Script Web App URL ของท่าน</label>
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={gasUrl}
                onChange={(e) => onUpdateGasUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                id="input-gas-url-setting"
              />
              <p className="text-[11px] text-slate-400">
                {gasUrl ? '🔔 บันทึก URL เรียบร้อยแล้ว ระบบจะทำการส่งเมลจริงผ่านบัญชีผู้ใช้งานทันทีที่เริ่มสแกน' : '⚠️ ปัจจุบันระบบใช้ "โหมดทดสอบส่งเมลจำลอง" ประวัติการเช็คอินทั้งหมดจะแสดงใน Console และแจ้งเตือนของหน้าเว็บ'}
              </p>
              {gasUrl && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs leading-relaxed text-amber-900 space-y-2 mt-2 shadow-xs">
                  <span className="font-bold flex items-center gap-1.5 text-amber-800 text-sm">
                    📢 แนะนำพิเศษสำหรับปัญหา "ภาพโปสเตอร์ไม่แสดงในอีเมล (ภาพไม่ขึ้น)"
                  </span>
                  <p>
                    เนื่องจาก Gmail และ Mail Clients ส่วนใหญ่บล็อกภาพประเภท Base64 (ภาพที่อัปโหลดโดยตรงเข้าสู่เว็บบอร์ด) 
                    ระบบจึงอัปเกรดความสามารถให้ส่งออกแบบเป็น <strong>รูปภาพไฟล์แนบจริง (Inline CID Image)</strong> ซึ่งปลอดภัยและถูกต้องสูงสุดตามมาตรฐาน
                  </p>
                  <p className="font-bold text-amber-950">
                    💡 วิธีการแก้ไขปัญหา:
                  </p>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-amber-950 font-medium">
                    <li>กรุณาคัดลอกซอร์สโค้ดในแถบ <strong>"คู่มือจัดตั้งระบบส่งอีเมลฟรี (Google Apps Script)"</strong> ด้านล่างนี้</li>
                    <li>นำไป <strong>วางทับสคริปต์เดิม (ไฟล์ รหัส.gs)</strong> บนโครงการ Google Apps Script ของท่าน</li>
                    <li>กด <strong>การทำให้ใช้งานได้ใหม่ (New Deployment)</strong> และเปลี่ยนค่าประเภทเข้าถึงเป็น <strong>ทุกคน (Anyone)</strong> และนำ URL ใหม่มาเปลี่ยน</li>
                  </ul>
                </div>
              )}
            </div>

            {/* BASE APPLICATION URL SETTINGS */}
            <hr className="border-slate-100" />

            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="h-5.5 w-5.5 text-orange-600" />
                <span>กำหนด URL ตัวจริงของหน้ารายการสัมมนา (Base Application URL)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                กำหนด URL ปลายทางหลักของเว็บบอร์ด เพื่อเชื่อมโยง QR Code เผยแพร่ และลิงก์ภายในตั๋วหรืออีเมลให้เปิดทำงานเข้าถึงจากภายนอก/สมาร์ทโฟนได้ถูกต้อง 100% ตัวอย่าง: <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono text-[10px]">https://ais-share-xxx.run.app</code>
              </p>
            </div>

            {(window.location.origin.includes('aistudio.google.com') || window.location.origin.includes('googleusercontent.com')) && !baseAppUrl && (
              <div className="bg-orange-50 border border-orange-200 p-3.5 rounded-xl text-[11px] leading-relaxed text-orange-850 space-y-1 shadow-xs">
                <span className="font-bold flex items-center gap-1 text-xs">⚠️ แนะนำอย่างยิ่งสำหรับการรันบน sandbox (aistudio)</span>
                <p>เนื่องจากหน้าจอนี้รันภายในเฟรมตรวจงานของสตูดิโอ หากนำโทรศัพท์สแกน QR Code ดั้งเดิมจะติดปัญหาเปิดไม่ขึ้นเพราะโดเมน <code className="font-mono bg-orange-100/60 rounded text-orange-950 px-1">aistudio.google.com</code> จำกัดสิทธิ์เฉพาะนักพัฒนา</p>
                <p className="font-bold text-orange-900">• โปรดคัดลอกลิงก์ตัวจริงจากการกดปุ่มแชร์ขวาบนของ AI Studio (สัตยาบันเป็นลิงก์ .run.app) มาวางใส่กล่องด้านล่างนี้ได้เลยค่ะ!</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">ป้อน URL แอปพลิเคชันตัวจริง (Base App URL สำหรับสร้างลิงก์และสแกนเช็คอินจริง)</label>
              <input
                type="text"
                placeholder="https://ais-pre-3fyg4vczltrub3tzakr4q2-314979693296.asia-southeast1.run.app"
                value={baseAppUrl}
                onChange={(e) => onUpdateBaseAppUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                id="input-base-app-url-setting"
              />
              <p className="text-[11px] text-slate-400">
                {baseAppUrl ? `🔔 ปัจจุบันระบบกำลังล็อคลิงก์และ QR Code ทั้งหมดให้ยิงตรงไปที่ดาวเทียม: ${baseAppUrl}` : `🌐 ปัจจุบันใช้ระบบดึงอัตโนมัติจากเว็บบราวเซอร์เป็นหลัง: ${window.location.origin}`}
              </p>
            </div>

            {/* EMAIL TEMPLATE EDITORS */}
            <hr className="border-slate-100" />

            <div>
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
                <Mail className="h-5.5 w-5.5 text-orange-600" />
                <span>ปรับแต่งหัวข้อและเนื้อหาอีเมลอัตโนมัติ (Automated Email Customizer)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                คุณสามารถออกแบบเนื้อหาจดหมายตอบกลับ (ทั้งหัวเรื่องและตัวข้อความ) ที่ระบบส่งยืนยันหาคุณครู/ผู้ร่วมลงทะเบียนเข้าเรียนโดยอัตโนมัติ (รองรับข้อมูลด้วยตัวแปรและการพิมพ์โค้ด HTML)
              </p>
            </div>

             {/* EMAIL TEMPLATE EDITORS TABBED CONTAINER */}
             <div className="space-y-4">
               {/* Tab buttons */}
               <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                 <button
                   type="button"
                   onClick={() => setSelectedTemplateTab('register')}
                   className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition cursor-pointer ${
                     selectedTemplateTab === 'register'
                       ? 'border-orange-500 text-orange-600 bg-orange-50/40'
                       : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                   }`}
                 >
                   <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                   <span>1. ยืนยันการลงทะเบียน</span>
                 </button>
                 <button
                   type="button"
                   onClick={() => setSelectedTemplateTab('checkin')}
                   className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition cursor-pointer ${
                     selectedTemplateTab === 'checkin'
                       ? 'border-violet-600 text-violet-700 bg-violet-50/40'
                       : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                   }`}
                 >
                   <span className="w-2 h-2 bg-violet-600 rounded-full"></span>
                   <span>2. เช็คอินเข้าอบรมสำเร็จ</span>
                 </button>
                 <button
                   type="button"
                   onClick={() => setSelectedTemplateTab('reminder')}
                   className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition cursor-pointer ${
                     selectedTemplateTab === 'reminder'
                       ? 'border-blue-500 text-blue-600 bg-blue-50/40'
                       : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                   }`}
                 >
                   <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                   <span>3. เตรียมความพร้อมเข้าอบรม</span>
                 </button>
                 <button
                   type="button"
                   onClick={() => setSelectedTemplateTab('evaluation')}
                   className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition cursor-pointer ${
                     selectedTemplateTab === 'evaluation'
                       ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                       : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                   }`}
                 >
                   <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                   <span>4. ส่งแบบประเมินผล</span>
                 </button>
               </div>

               {/* Active Editor Card */}
               <div className="border border-slate-200 p-6 rounded-2xl bg-white space-y-4 shadow-sm">
                 {selectedTemplateTab === 'register' && (
                   <div className="space-y-4">
                     <div className="border-b border-slate-100 pb-2">
                       <h4 className="text-sm font-black text-slate-800">1. อีเมลยืนยันการลงทะเบียนสำเร็จ (Registration Template)</h4>
                       <p className="text-xs text-slate-400 mt-0.5">ส่งหาผู้ใช้ทันทีหลังจากกดลงทะเบียนเรียนผ่านพอร์ทัลผู้เรียนสำเร็จ</p>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">หัวเรื่องอีเมล (Subject Line)</label>
                       <input
                         type="text"
                         value={registerSubject}
                         onChange={(e) => setRegisterSubject(e.target.value)}
                         className="w-full bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                         placeholder="ป้อนหัวข้อจดหมาย..."
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">เนื้อหาจดหมายแบบ HTML (HTML Code)</label>
                       <textarea
                         rows={14}
                         value={registerHtml}
                         onChange={(e) => setRegisterHtml(e.target.value)}
                         className="w-full max-h-[420px] bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850 font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                         placeholder="พิมพ์โค้ด HTML ของอีเมล..."
                       />
                     </div>
                   </div>
                 )}

                 {selectedTemplateTab === 'checkin' && (
                   <div className="space-y-4">
                     <div className="border-b border-slate-100 pb-2">
                       <h4 className="text-sm font-black text-slate-800">2. อีเมลแจ้งประวัติการเช็คอินเข้าเรียนสำเร็จ (Check-In Template)</h4>
                       <p className="text-xs text-slate-400 mt-0.5">ส่งหาผู้เรียนอัตโนมัติทันทีที่สแกนเช็คอินหน้าห้องอบรมสัมมนาเสร็จสิ้น</p>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">หัวเรื่องอีเมล (Subject Line)</label>
                       <input
                         type="text"
                         value={checkinSubject}
                         onChange={(e) => setCheckinSubject(e.target.value)}
                         className="w-full bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                         placeholder="ป้อนหัวข้อจดหมาย..."
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">เนื้อหาจดหมายแบบ HTML (HTML Code)</label>
                       <textarea
                         rows={14}
                         value={checkinHtml}
                         onChange={(e) => setCheckinHtml(e.target.value)}
                         className="w-full max-h-[420px] bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                         placeholder="พิมพ์โค้ด HTML ของอีเมล..."
                       />
                     </div>
                   </div>
                 )}

                 {selectedTemplateTab === 'reminder' && (
                   <div className="space-y-4">
                     <div className="border-b border-slate-100 pb-2">
                       <h4 className="text-sm font-black text-slate-800">3. อีเมลเตรียมความพร้อมก่อนวันเข้าอบรม (Reminder Template)</h4>
                       <p className="text-xs text-slate-400 mt-0.5">ใช้เป็นแม่แบบในการส่งจดหมายแจ้งเตือนล่วงหน้าก่อนวันอบรมสัมมนาจริง (สามารถแก้ไขในป๊อปอัปก่อนส่งได้อีกครั้ง)</p>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">หัวเรื่องอีเมล (Subject Line)</label>
                       <input
                         type="text"
                         value={reminderSubject}
                         onChange={(e) => setReminderSubject(e.target.value)}
                         className="w-full bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                         placeholder="ป้อนหัวข้อจดหมาย..."
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">เนื้อหาจดหมายแบบ HTML (HTML Code)</label>
                       <textarea
                         rows={14}
                         value={reminderHtml}
                         onChange={(e) => setReminderHtml(e.target.value)}
                         className="w-full max-h-[420px] bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                         placeholder="พิมพ์โค้ด HTML ของอีเมล..."
                       />
                     </div>
                   </div>
                 )}

                 {selectedTemplateTab === 'evaluation' && (
                   <div className="space-y-4">
                     <div className="border-b border-slate-100 pb-2">
                       <h4 className="text-sm font-black text-slate-800">4. อีเมลส่งฟอร์มประเมินความพึงพอใจการอบรม (Evaluation Template)</h4>
                       <p className="text-xs text-slate-400 mt-0.5">ใช้เป็นแม่แบบส่งลิงก์ตอบแบบประเมินรายบุคคลเพื่อรวบรวมเป็นงานวิจัยเชิงวิจัย (สามารถแก้ไขก่อนกระจายส่งได้)</p>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">หัวเรื่องอีเมล (Subject Line)</label>
                       <input
                         type="text"
                         value={evaluationSubject}
                         onChange={(e) => setEvaluationSubject(e.target.value)}
                         className="w-full bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                         placeholder="ป้อนหัวข้อจดหมาย..."
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[11px] font-bold text-slate-700 block">เนื้อหาจดหมายแบบ HTML (HTML Code)</label>
                       <textarea
                         rows={14}
                         value={evaluationHtml}
                         onChange={(e) => setEvaluationHtml(e.target.value)}
                         className="w-full max-h-[420px] bg-slate-50/50 border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                         placeholder="พิมพ์โค้ด HTML ของอีเมล..."
                       />
                     </div>
                   </div>
                 )}
               </div>
             </div>

             {/* DYNAMIC VARIABLE REPLACEMENT INSTRUCTIONS */}
             <div className="bg-orange-50/70 border border-orange-100/80 p-4 rounded-xl text-[11px] text-slate-700 space-y-1.5 leading-relaxed">
               <span className="font-extrabold text-orange-850 block text-xs">💡 คำจำเพาะตัวแปรอัตโนมัติ (Dynamic Replacement Tokens):</span>
               <p>สามารถป้อนคำในวงเล็บปีกกาด้านล่าง เพื่อให้ระบบแทนค่าข้อมูลผู้เรียนและรายละเอียดหลักสูตรแยกรายบุคคลโดยอัตโนมัติเมื่อจัดส่ง:</p>
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 font-mono text-[10px]">
                 <div><code className="text-orange-700 font-bold">{`{learner_name}`}</code> : ชื่อผู้รับ (ชื่อครู)</div>
                 <div><code className="text-orange-700 font-bold">{`{course_title}`}</code> : ชื่อวิชาหลักสูตรอบรม</div>
                 <div><code className="text-orange-700 font-bold">{`{course_date}`}</code> : วันที่ดำเนินงานจัด</div>
                 <div><code className="text-orange-700 font-bold">{`{course_time}`}</code> : ช่วงเวลาดำเนินงานจัด</div>
                 <div><code className="text-orange-700 font-bold">{`{course_location}`}</code> : สถานที่จัดอบรม</div>
                 <div><code className="text-orange-700 font-bold">{`{course_description}`}</code> : รายละเอียดวิชา</div>
                 <div><code className="text-orange-700 font-bold">{`{survey_link}`}</code> : ลิงก์ทำแบบประเมินความพึงพอใจ</div>
                 <div><code className="text-orange-700 font-bold">{`{learner_certificate_link}`}</code> : ลิงก์ดาวน์โหลดเกียรติบัตร</div>
               </div>
             </div>

             <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
               <button
                 type="button"
                 onClick={() => {
                   requestConfirmation(
                     'รีเซ็ตเทมเพลต',
                     `คุณต้องการรีเซ็ตเทมเพลตที่เลือกอยู่ (${selectedTemplateTab}) กลับเป็นค่าเริ่มต้นใช่ไหม?`,
                     () => {
                       if (selectedTemplateTab === 'register') {
                         setRegisterSubject(DEFAULT_REGISTER_SUBJECT);
                         setRegisterHtml(DEFAULT_REGISTER_HTML);
                       } else if (selectedTemplateTab === 'checkin') {
                         setCheckinSubject(DEFAULT_CHECKIN_SUBJECT);
                         setCheckinHtml(DEFAULT_CHECKIN_HTML);
                       } else if (selectedTemplateTab === 'reminder') {
                         setReminderSubject(DEFAULT_REMINDER_SUBJECT);
                         setReminderHtml(DEFAULT_REMINDER_HTML);
                       } else if (selectedTemplateTab === 'evaluation') {
                         setEvaluationSubject(DEFAULT_EVALUATION_SUBJECT);
                         setEvaluationHtml(DEFAULT_EVALUATION_HTML);
                       }
                     }
                   );
                 }}
                 className="px-4 h-10 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-650 rounded-lg transition font-bold cursor-pointer"
               >
                 รีเซ็ตกลับเป็นค่าเริ่มต้น
               </button>
               <button
                 type="button"
                 disabled={savingTemplate}
                 onClick={handleSaveEmailTemplates}
                 className="px-6 h-10 text-xs bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white font-extrabold rounded-lg transition flex items-center gap-1.5 shadow cursor-pointer"
               >
                 {savingTemplate ? 'กำลังบันทึก...' : '💾 บันทึกเทมเพลตจดหมาย'}
               </button>
             </div>
             {saveTemplateSuccess && (
               <p className="text-xs text-emerald-600 font-black text-right">✓ บันทึกโครงสร้างเทมเพลตจดหมายและเชื่อมระบบเรียบร้อย!</p>
             )}

            <hr className="border-slate-100" />

            <AppsScriptGuide />
          </div>
        </div>
      )}
      </main>

      {/* QR MODAL GENERATION & DISPLAY FOR COURSE CHECK-INS */}
      {showQrModal && qrCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full uppercase">
                  Check-In QR Code
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-1">
                  โค้ดสแกนประจำวิทยากรอบรม
                </h3>
              </div>
              <button onClick={() => { setShowQrModal(false); setQrCourse(null); setCopiedLink(false); }} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4 overflow-y-auto">
              <p className="text-sm font-bold text-slate-900 leading-snug">{qrCourse.title}</p>
              
              {/* Real high-quality scannable QR Code */}
              <div className="p-4 bg-white border border-slate-200 rounded-3xl flex flex-col items-center justify-center shadow-inner">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${getCleanOrigin()}/?courseId=${qrCourse.id}&action=checkin`)}`}
                  alt="Check-In QR Code"
                  className="w-56 h-56 rounded-2xl object-contain bg-white border border-slate-100 p-2"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Time validator indicators */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left w-full text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1">
                  <Clock className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                  <span>สัญกรณ์ตรวจสอบเวลา Time-based Validation</span>
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  ช่วงเวลาเป้าหมายเปิดเช็คอิน: {qrCourse.qrOpenTime ? new Date(qrCourse.qrOpenTime).toLocaleString('th-TH') : 'ฟรีไม่ล็อกเริ่มต้น'}<br />
                  ช่วงสิ้นสุดระบบล็อก: {qrCourse.qrCloseTime ? new Date(qrCourse.qrCloseTime).toLocaleString('th-TH') : 'ไม่มีล็อกปิด'}
                </p>
              </div>

              {/* Copy and open redirect controls */}
              <div className="w-full space-y-2">
                <button
                  onClick={() => {
                    const checkInLink = `${getCleanOrigin()}/?courseId=${qrCourse.id}&action=checkin`;
                    navigator.clipboard.writeText(checkInLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1.5 min-h-[44px]"
                  id="btn-copy-checkin-link"
                >
                  {copiedLink ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedLink ? 'คัดลอกลิงก์สแกนแล้ว!' : 'คัดลอกลิงก์สำหรับสแกนเข้างาน'}</span>
                </button>
                <p className="text-[10px] text-slate-400">เมื่อผู้ใช้สแกนผ่านลิงก์นี้ ระบบจะบันทึกเช็คอินสัญชาตลักษณ์และเปิดแบบประเมินผู้ใช้ทันที</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR MODAL GENERATION & DISPLAY FOR COURSE EVALUATION / SURVEY */}
      {showEvalQrModal && qrCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">
                  Evaluation QR Code
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-1">
                  โค้ดสแกนเพื่อทำแบบประเมินผลหลังอบรม
                </h3>
              </div>
              <button onClick={() => { setShowEvalQrModal(false); setQrCourse(null); setCopiedLink(false); }} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4 overflow-y-auto">
              <p className="text-sm font-bold text-slate-900 leading-snug">{qrCourse.title}</p>
              
              {/* Real high-quality scannable QR Code */}
              <div className="p-4 bg-white border border-slate-200 rounded-3xl flex flex-col items-center justify-center shadow-inner">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${getCleanOrigin()}/?courseId=${qrCourse.id}&action=feedback`)}`}
                  alt="Evaluation QR Code"
                  className="w-56 h-56 rounded-2xl object-contain bg-white border border-slate-100 p-2"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Information text */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-left w-full text-xs text-emerald-900">
                <p className="font-bold flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-700 mt-0.5 flex-shrink-0" />
                  <span>สแกนตอบแบบประเมินความพึงพอใจ</span>
                </p>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  ผู้เข้าร่วมอบรมสามารถใช้สมาร์ทโฟนสแกน QR Code นี้ เพื่อทำแบบประเมินความพึงพอใจหลังเสร็จสิ้นการอบรมได้ทันที โดยระบบจะนำทางไปยังหน้าประเมินผลของหลักสูตรนี้โดยตรง
                </p>
              </div>

              {/* Copy and open redirect controls */}
              <div className="w-full space-y-2">
                <button
                  onClick={() => {
                    const feedbackLink = `${getCleanOrigin()}/?courseId=${qrCourse.id}&action=feedback`;
                    navigator.clipboard.writeText(feedbackLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition duration-150 flex items-center justify-center gap-1.5 min-h-[44px]"
                  id="btn-copy-feedback-link"
                >
                  {copiedLink ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedLink ? 'คัดลอกลิงก์แบบประเมินแล้ว!' : 'คัดลอกลิงก์แบบประเมินความพึงพอใจ'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL REGISTER PARTICIPANT MODAL */}
      {showManualRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  Manual Registration
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 leading-snug">
                  เพิ่มผู้เข้าอบรมด้วยตนเอง (Manual)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  หลักสูตร: <span className="font-bold text-slate-700">{courses.find(c => c.id === selectedCourseId)?.title}</span>
                </p>
              </div>
              <button onClick={() => setShowManualRegisterModal(false)} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {manualRegisterError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-xl text-xs font-bold">
                  ⚠️ {manualRegisterError}
                </div>
              )}

              {/* Autocomplete / Select existing personnel */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">
                  🔍 ค้นหาและเลือกรายชื่อบุคลากร (พิมพ์เพื่อค้นหา)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="พิมพ์รหัสพนักงาน, ชื่อ-นามสกุล, อีเมล หรือหน่วยงาน..."
                    value={manualSearchQuery}
                    onChange={(e) => setManualSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 pl-9 pr-8 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[40px] font-bold shadow-2xs"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search className="h-4 w-4" />
                  </div>
                  {manualSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setManualSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-extrabold p-1 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filtered List Selection Area */}
                <div className="border border-slate-150 rounded-xl bg-slate-50/50 max-h-40 overflow-y-auto divide-y divide-slate-100 shadow-inner">
                  {(() => {
                    const query = manualSearchQuery.trim().toLowerCase();
                    const filtered = personnel.filter(p => {
                      if (!query) return true;
                      return (
                        (p.id && p.id.toLowerCase().includes(query)) ||
                        (p.name && p.name.toLowerCase().includes(query)) ||
                        (p.email && p.email.toLowerCase().includes(query)) ||
                        (p.department && p.department.toLowerCase().includes(query))
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-3 text-xs text-slate-400 text-center font-bold">
                          ❌ ไม่พบรายชื่อบุคลากรที่ตรงกับเงื่อนไขค้นหา
                        </div>
                      );
                    }

                    return filtered.map(p => {
                      const isSelected = manualRegisterForm.personnelId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setManualRegisterForm({
                              personnelId: p.id || '',
                              name: p.name || '',
                              email: p.email || '',
                              department: p.department || ''
                            });
                            setManualRegisterError('');
                          }}
                          className={`w-full text-left p-2 px-3 hover:bg-emerald-50/65 text-xs transition flex flex-col gap-0.5 cursor-pointer ${
                            isSelected ? 'bg-emerald-50 border-l-4 border-emerald-500' : ''
                          }`}
                        >
                          <div className="font-extrabold text-slate-800 flex items-center justify-between">
                            <span className={isSelected ? 'text-emerald-700 font-black' : ''}>{p.name}</span>
                            <span className="text-[10px] bg-slate-200/70 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                              {p.id}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center justify-between mt-0.5">
                            <span className="truncate max-w-[200px]">{p.email}</span>
                            <span className="text-emerald-600 font-semibold truncate max-w-[180px]">{p.department}</span>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="border-t border-slate-100 my-2 pt-2"></div>

              {/* Personnel ID */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">รหัสบุคลากร *</label>
                <input
                  type="text"
                  placeholder="เช่น 10502011"
                  value={manualRegisterForm.personnelId}
                  onChange={(e) => setManualRegisterForm({ ...manualRegisterForm, personnelId: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[40px] font-bold"
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">ชื่อ-นามสกุลจริง *</label>
                <input
                  type="text"
                  placeholder="เช่น สมชาย ใจดี"
                  value={manualRegisterForm.name}
                  onChange={(e) => setManualRegisterForm({ ...manualRegisterForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[40px] font-bold"
                />
              </div>

              {/* Email Address */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">อีเมลมหาวิทยาลัยกรุงเทพ (@bu.ac.th) *</label>
                <input
                  type="email"
                  placeholder="เช่น somchai.t@bu.ac.th"
                  value={manualRegisterForm.email}
                  onChange={(e) => setManualRegisterForm({ ...manualRegisterForm, email: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[40px] font-bold"
                />
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 block uppercase tracking-wider">หน่วยงาน / สังกัด *</label>
                <input
                  type="text"
                  placeholder="เช่น คณะเทคโนโลยีสารสนเทศและนวัตกรรม"
                  value={manualRegisterForm.department}
                  onChange={(e) => setManualRegisterForm({ ...manualRegisterForm, department: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[40px] font-bold"
                />
              </div>

              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-[11px] text-emerald-800 leading-relaxed font-semibold">
                🔔 <strong className="text-emerald-900">หมายเหตุสำคัญ:</strong> หลังจากบันทึกชื่อผู้เข้าอบรมแล้ว ระบบจะส่งอีเมลแจ้งยืนยันสิทธิ์ พร้อมส่งลิงก์ปฏิทิน Google Calendar นัดหมายสัมมนาไปหาบุคลากรคนดังกล่าวแบบอัตโนมัติทันที
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => setShowManualRegisterModal(false)}
                className="flex-1 h-11 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs transition flex items-center justify-center cursor-pointer shadow-sm"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveManualRegistration}
                disabled={manualRegisterSubmitting}
                className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-black rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                {manualRegisterSubmitting ? 'กำลังจัดส่งและลงทะเบียน...' : 'ลงทะเบียนและส่งอีเมลยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. SEND REMINDER EMAIL MODAL */}
      {showReminderModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-black text-blue-700 bg-blue-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  LD Reminder Campaign
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 leading-snug">
                  ส่งอีเมลแจ้งเตือนผู้ลงทะเบียนหลักสูตร
                </h3>
              </div>
              <button onClick={() => setShowReminderModal(false)} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {(() => {
                const selCourse = courses.find(c => c.id === selectedCourseId);
                const allRegs = registrations.filter(r => r.courseId === selectedCourseId);
                const checkedCount = Object.keys(selectedRegIds).length;
                const finalRecipients = checkedCount > 0 
                  ? allRegs.filter(r => selectedRegIds[r.id]) 
                  : allRegs;

                return (
                  <>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-650 space-y-1.5 leading-relaxed">
                      <p><strong>ประเภทการคัดกรอง:</strong> {checkedCount > 0 ? `ส่งแบบเจาะจงเฉพาะผู้เลือก (${checkedCount} คน)` : `ส่งตามผลลัพธ์คัดกรองทั้งหมด (${finalRecipients.length} คน)`}</p>
                      <p><strong>หลักสูตรต้นทาง:</strong> {selCourse?.title}</p>
                      <p><strong>วิทยากรผู้สอน:</strong> {selCourse?.speaker}</p>
                    </div>

                    {/* Modal Send Type Toggle */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 block">รูปแบบการจัดส่ง (Email Dispatch Method) *</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                        <button
                          type="button"
                          onClick={() => setModalSendType('individual')}
                          className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                            modalSendType === 'individual'
                              ? 'bg-white text-blue-600 shadow-2xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">✉️ ส่งแยกรายบุคคล</span>
                          <span className="text-[8px] opacity-75 font-normal">ระบุชื่อรายคน</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalSendType('group_to')}
                          className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                            modalSendType === 'group_to'
                              ? 'bg-white text-blue-600 shadow-2xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">📬 ส่งกลุ่ม To ทุกคน</span>
                          <span className="text-[8px] opacity-75 font-normal">To ทุกคน (เรียน อาจารย์ทุกท่าน)</span>
                        </button>
                      </div>
                    </div>

                    {/* CC Admin Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-lg border border-slate-150/50">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-semibold text-slate-700 block">สำเนาถึงผู้ดูแลระบบ (CC to Admin)</span>
                          <span className="text-[9px] text-slate-500 block">ส่งสำเนาอีเมลนี้เพื่อใช้เก็บหลักฐาน</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={modalCcAdmin}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setModalCcAdmin(checked);
                              if (checked && modalCcEmails.length === 0 && userEmail) {
                                setModalCcEmails([userEmail.toLowerCase()]);
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                        </label>
                      </div>

                      {modalCcAdmin && (
                        <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg space-y-2 max-h-36 overflow-y-auto animate-fadeIn">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">เลือกรายชื่อผู้รับ CC (Admins to CC):</p>
                          {adminsList.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">ไม่พบรายชื่อแอดมินในระบบ</p>
                          ) : (
                            <div className="space-y-1">
                              {adminsList.map(adm => {
                                const isCurrentUser = adm.email.toLowerCase() === (userEmail || '').toLowerCase();
                                return (
                                  <label key={adm.email} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-100 p-0.5 rounded transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={modalCcEmails.includes(adm.email.toLowerCase())}
                                      onChange={(ev) => {
                                        const email = adm.email.toLowerCase();
                                        if (ev.target.checked) {
                                          setModalCcEmails(prev => [...prev, email]);
                                        } else {
                                          setModalCcEmails(prev => prev.filter(em => em !== email));
                                        }
                                      }}
                                      className="rounded text-blue-500 focus:ring-blue-500 h-3 w-3 border-slate-300"
                                    />
                                    <span className="truncate">
                                      <strong>{adm.name}</strong> <span className="text-slate-400 font-mono text-[9px]">({adm.email})</span> {isCurrentUser && <span className="ml-1 text-[9px] px-1 bg-blue-100 text-blue-700 font-bold rounded">คุณ</span>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-extrabold text-slate-700 block">หัวเรื่องอีเมล (Email Subject)</label>
                      <input
                        type="text"
                        value={modalEmailSubject}
                        onChange={(e) => setModalEmailSubject(e.target.value)}
                        className="w-full text-xs text-slate-800 border border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:ring-0 focus:outline-none font-bold"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-slate-700 block">พิมพ์ใจความแจ้งเตือนสำคัญ (รองรับตัวแปรอัตโนมัติ)</label>
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setModalViewTab('editor')}
                            className={`px-2 py-0.5 rounded font-bold transition ${modalViewTab === 'editor' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            ✏️ เขียนเนื้อหา
                          </button>
                          <button
                            type="button"
                            onClick={() => setModalViewTab('preview')}
                            className={`px-2 py-0.5 rounded font-bold transition ${modalViewTab === 'preview' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            👁️ ตัวอย่างก่อนส่ง
                          </button>
                        </div>
                      </div>

                      {modalViewTab === 'editor' ? (
                        <>
                          <textarea
                            value={modalEmailMessage}
                            onChange={(e) => setModalEmailMessage(e.target.value)}
                            rows={7}
                            className="w-full text-xs text-slate-850 border border-slate-200 p-3 rounded-xl focus:border-blue-500 focus:ring-0 focus:outline-none leading-relaxed font-sans"
                            placeholder="กรุณากรอกข้อมูลสัญกรณ์..."
                          />
                          <ImageToHtmlHelper onInsert={(htmlImg) => setModalEmailMessage(prev => prev + "\n" + htmlImg + "\n")} />
                          <p className="text-[10px] text-slate-400 font-medium">
                            * ระบบดำเนินการเปลี่ยนค่าหัวข้ออัตโนมัติ: <code className="text-red-500 font-bold">{`{course_title}`}</code>, <code className="text-red-500 font-bold">{`{date_time}`}</code>, <code className="text-red-500 font-bold">{`{location}`}</code>, <code className="text-red-500 font-bold">{`{speaker}`}</code>, <code className="text-red-500 font-bold">{`{register_link}`}</code>
                          </p>
                          <div className="mt-1.5 bg-blue-50/70 border border-blue-100 p-2.5 rounded-lg text-[10px] text-slate-600 space-y-1 leading-normal">
                            <p className="font-bold text-slate-700">🖼️ วิธีใส่รูปภาพในการแจ้งเตือน:</p>
                            <p>1. แทรกรูปโปสเตอร์คอร์สนี้อัตโนมัติ: พิมพ์ <code className="text-blue-600 bg-white px-1 py-0.2 rounded font-mono font-bold">{`{course_poster}`}</code> ลงในข้อความได้เลยค่ะ</p>
                            <p>2. ใส่รูปภาพจากเว็บไซต์ภายนอกด้วย HTML: <code className="text-slate-700 bg-white px-1 py-0.2 rounded font-mono">{`<img src="ลิงก์รูปภาพของคุณ" style="max-width:100%; border-radius:8px;"/>`}</code></p>
                          </div>
                        </>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white p-4 space-y-3 font-sans">
                          <div className="bg-gradient-to-r from-blue-600 to-sky-500 text-white p-3 rounded-lg text-center">
                            <h4 className="text-xs font-bold uppercase tracking-wider opacity-90">Bangkok University</h4>
                            <h3 className="text-sm font-extrabold">สำนักมาตรฐานคุณภาพการศึกษา</h3>
                          </div>
                          <div className="text-xs text-slate-600 font-bold border-b border-slate-100 pb-1">
                            เรื่อง: {modalEmailSubject.replace('{course_title}', selCourse?.title || '')}
                          </div>
                          <div 
                            className="text-xs text-slate-800 leading-relaxed"
                            style={{
                              fontSize: emailTextFontSize,
                              textAlign: emailTextAlign,
                              lineHeight: emailLineHeight,
                              wordBreak: emailWrapMode === 'keep_all' ? 'keep-all' : 'normal',
                              overflowWrap: 'break-word',
                              lineBreak: 'loose',
                              whiteSpace: emailWrapMode === 'strict' ? 'pre-wrap' : 'normal'
                            }}
                            dangerouslySetInnerHTML={{
                              __html: formatMessageForHtml(
                                modalEmailMessage
                                  .replace(/\{course_title\}/g, selCourse?.title || '')
                                  .replace(/\{date_time\}/g, `${selCourse?.date || ''} เวลา ${selCourse?.time || ''} น.`)
                                  .replace(/\{location\}/g, selCourse?.location || '')
                                  .replace(/\{speaker\}/g, selCourse?.speaker || '')
                                  .replace(/\{name\}/g, finalRecipients[0]?.name || 'ผู้เข้าอบรม')
                              )
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setSendingBulkEmail(true);
                        try {
                          await handleSendBulkEmailGroup(finalRecipients, modalEmailSubject, modalEmailMessage, false);
                          setShowReminderModal(false);
                          setSelectedRegIds({}); // Clear selected checkboxes
                        } catch (err) {
                          alert('ข้อผิดพลาดการจัดส่ง: ' + String(err));
                        } finally {
                          setSendingBulkEmail(false);
                        }
                      }}
                      disabled={sendingBulkEmail || !modalEmailSubject.trim() || !modalEmailMessage.trim()}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                    >
                      {sendingBulkEmail ? 'กำลังดำเนินการส่งสารเช็คอินกล่องขาเข้า...' : `สั่งจ่ายเมลกลุ่มแจ้งเตือนจริงถึง (${finalRecipients.length} คน) ทันที`}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 2. SEND EVALUATION EMAIL MODAL */}
      {showEvaluationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  LD Satisfaction Survey Launcher
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 leading-snug animate-none">
                  ส่งแบบสำรวจความพึงพอใจการอบรมขยายผล
                </h3>
              </div>
              <button onClick={() => setShowEvaluationModal(false)} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {(() => {
                const selCourse = courses.find(c => c.id === selectedCourseId);
                const checkedOnly = registrations.filter(r => r.courseId === selectedCourseId && r.checkedIn);
                const selectedCount = Object.keys(selectedRegIds).length;
                const finalRecipients = selectedCount > 0 
                  ? checkedOnly.filter(r => selectedRegIds[r.id]) 
                  : checkedOnly;

                return (
                  <>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-650 space-y-1.5 leading-relaxed">
                      <p><strong>เป้าหมายจัดส่ง:</strong> {selectedCount > 0 ? `ผู้เลือกและเช็คอินแล้ว (${selectedCount} คน)` : `ผู้เช็คอินสำเร็จทั้งหมด (${checkedOnly.length} คน)`}</p>
                      <p><strong>หลักสูตรประเมิน:</strong> {selCourse?.title}</p>
                    </div>

                    {/* Modal Send Type Toggle */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 block">รูปแบบการจัดส่ง (Email Dispatch Method) *</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                        <button
                          type="button"
                          onClick={() => setModalSendType('individual')}
                          className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                            modalSendType === 'individual'
                              ? 'bg-white text-emerald-600 shadow-2xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">✉️ ส่งแยกรายบุคคล</span>
                          <span className="text-[8px] opacity-75 font-normal">ระบุชื่อรายคน</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalSendType('group_to')}
                          className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                            modalSendType === 'group_to'
                              ? 'bg-white text-emerald-600 shadow-2xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">📬 ส่งกลุ่ม To ทุกคน</span>
                          <span className="text-[8px] opacity-75 font-normal">To ทุกคน (เรียน อาจารย์ทุกท่าน)</span>
                        </button>
                      </div>
                    </div>

                    {/* CC Admin Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-lg border border-slate-150/50">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-semibold text-slate-700 block">สำเนาถึงผู้ดูแลระบบ (CC to Admin)</span>
                          <span className="text-[9px] text-slate-500 block">ส่งสำเนาอีเมลนี้เพื่อใช้เก็บหลักฐาน</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={modalCcAdmin}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setModalCcAdmin(checked);
                              if (checked && modalCcEmails.length === 0 && userEmail) {
                                setModalCcEmails([userEmail.toLowerCase()]);
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {modalCcAdmin && (
                        <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg space-y-2 max-h-36 overflow-y-auto animate-fadeIn">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">เลือกรายชื่อผู้รับ CC (Admins to CC):</p>
                          {adminsList.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">ไม่พบรายชื่อแอดมินในระบบ</p>
                          ) : (
                            <div className="space-y-1">
                              {adminsList.map(adm => {
                                const isCurrentUser = adm.email.toLowerCase() === (userEmail || '').toLowerCase();
                                return (
                                  <label key={adm.email} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-100 p-0.5 rounded transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={modalCcEmails.includes(adm.email.toLowerCase())}
                                      onChange={(ev) => {
                                        const email = adm.email.toLowerCase();
                                        if (ev.target.checked) {
                                          setModalCcEmails(prev => [...prev, email]);
                                        } else {
                                          setModalCcEmails(prev => prev.filter(em => em !== email));
                                        }
                                      }}
                                      className="rounded text-emerald-500 focus:ring-emerald-500 h-3 w-3 border-slate-300"
                                    />
                                    <span className="truncate">
                                      <strong>{adm.name}</strong> <span className="text-slate-400 font-mono text-[9px]">({adm.email})</span> {isCurrentUser && <span className="ml-1 text-[9px] px-1 bg-emerald-100 text-emerald-700 font-bold rounded">คุณ</span>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-extrabold text-slate-700 block">หัวเรื่องจดหมายสากล (Email Subject)</label>
                      <input
                        type="text"
                        value={modalEmailSubject}
                        onChange={(e) => setModalEmailSubject(e.target.value)}
                        className="w-full text-xs text-slate-805 border border-slate-200 p-3 rounded-xl focus:border-emerald-500 focus:ring-0 focus:outline-none font-bold"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-slate-700 block">เนื้อหาจดหมายเรียนเชิญช่วยตอบประเมินผล</label>
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setModalViewTab('editor')}
                            className={`px-2 py-0.5 rounded font-bold transition ${modalViewTab === 'editor' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            ✏️ เขียนเนื้อหา
                          </button>
                          <button
                            type="button"
                            onClick={() => setModalViewTab('preview')}
                            className={`px-2 py-0.5 rounded font-bold transition ${modalViewTab === 'preview' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            👁️ ตัวอย่างก่อนส่ง
                          </button>
                        </div>
                      </div>

                      {modalViewTab === 'editor' ? (
                        <>
                          <textarea
                            value={modalEmailMessage}
                            onChange={(e) => setModalEmailMessage(e.target.value)}
                            rows={7}
                            className="w-full text-xs text-slate-850 border border-slate-200 p-3 rounded-xl focus:border-emerald-500 focus:ring-0 focus:outline-none leading-relaxed font-sans"
                            placeholder="กรุณากรอกข้อมูลสัญกรณ์..."
                          />
                          <ImageToHtmlHelper onInsert={(htmlImg) => setModalEmailMessage(prev => prev + "\n" + htmlImg + "\n")} />
                          <p className="text-[10px] text-slate-400 font-medium leading-normal">
                            * ระบบแทรกลิงก์รายบุคคลอัตโนมัติ: <code className="text-red-500 font-bold">{`👉 {course_id} & {email}`}</code> ซึ่งเชื่อมโยงโดยตรงเข้าหน้าเพจกรอกคะแนนความพึงพอใจและ comment feedback คืนสถาบัน
                          </p>
                          <div className="mt-1.5 bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-lg text-[10px] text-slate-600 space-y-1 leading-normal">
                            <p className="font-bold text-slate-700">🖼️ วิธีใส่รูปภาพในการแจ้งเตือน:</p>
                            <p>1. แทรกรูปโปสเตอร์คอร์สนี้อัตโนมัติ: พิมพ์ <code className="text-blue-600 bg-white px-1 py-0.2 rounded font-mono font-bold">{`{course_poster}`}</code> ลงในข้อความได้เลยค่ะ</p>
                            <p>2. ใส่รูปภาพจากเว็บไซต์ภายนอกด้วย HTML: <code className="text-slate-700 bg-white px-1 py-0.2 rounded font-mono">{`<img src="ลิงก์รูปภาพของคุณ" style="max-width:100%; border-radius:8px;"/>`}</code></p>
                          </div>
                        </>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white p-4 space-y-3 font-sans">
                          <div className="bg-gradient-to-r from-emerald-600 to-teal-500 text-white p-3 rounded-lg text-center">
                            <h4 className="text-xs font-bold uppercase tracking-wider opacity-90">Bangkok University</h4>
                            <h3 className="text-sm font-extrabold">สำนักมาตรฐานคุณภาพการศึกษา</h3>
                          </div>
                          <div className="text-xs text-slate-600 font-bold border-b border-slate-100 pb-1">
                            เรื่อง: {modalEmailSubject.replace('{course_title}', selCourse?.title || '')}
                          </div>
                          <div 
                            className="text-xs text-slate-800 leading-relaxed"
                            style={{
                              fontSize: emailTextFontSize,
                              textAlign: emailTextAlign,
                              lineHeight: emailLineHeight,
                              wordBreak: emailWrapMode === 'keep_all' ? 'keep-all' : 'normal',
                              overflowWrap: 'break-word',
                              lineBreak: 'loose',
                              whiteSpace: emailWrapMode === 'strict' ? 'pre-wrap' : 'normal'
                            }}
                            dangerouslySetInnerHTML={{
                              __html: formatMessageForHtml(
                                modalEmailMessage
                                  .replace(/\{course_title\}/g, selCourse?.title || '')
                                  .replace(/\{date_time\}/g, `${selCourse?.date || ''} เวลา ${selCourse?.time || ''} น.`)
                                  .replace(/\{location\}/g, selCourse?.location || '')
                                  .replace(/\{speaker\}/g, selCourse?.speaker || '')
                                  .replace(/\{name\}/g, finalRecipients[0]?.name || 'ผู้เข้าอบรม')
                              )
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setSendingBulkEmail(true);
                        try {
                          await handleSendBulkEmailGroup(finalRecipients, modalEmailSubject, modalEmailMessage, false);
                          setShowEvaluationModal(false);
                          setSelectedRegIds({}); // Clear selected checkboxes
                        } catch (err) {
                          alert('ข้อผิดพลาดการจัดส่ง: ' + String(err));
                        } finally {
                          setSendingBulkEmail(false);
                        }
                      }}
                      disabled={sendingBulkEmail || !modalEmailSubject.trim() || !modalEmailMessage.trim()}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                    >
                      {sendingBulkEmail ? 'กำลังทรานสมิตส่งแบบประเมินเข้าระบบ...' : `สั่งยิงเมลแบบฟอร์มประเมินผู้ใช้ (${finalRecipients.length} คน) ทันที`}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 3. SEND CERTIFICATE EMAIL MODAL */}
      {showCertificateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-black text-amber-700 bg-amber-100 px-3 py-1 rounded-full uppercase tracking-wider">
                  LD Certification Dispatcher
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 leading-snug">
                  จัดส่งภาพจำลองและเกียรติบัตรรับรองสัมพันธภาพ
                </h3>
              </div>
              <button onClick={() => setShowCertificateModal(false)} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {(() => {
                const selCourse = courses.find(c => c.id === selectedCourseId);
                const isCheckedOnly = registrations.filter(r => r.courseId === selectedCourseId && r.checkedIn);
                const selectedCount = Object.keys(selectedRegIds).length;
                const finalRecipients = selectedCount > 0 
                  ? isCheckedOnly.filter(r => selectedRegIds[r.id]) 
                  : isCheckedOnly;

                return (
                  <>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-650 space-y-1.5 leading-relaxed">
                      <p><strong>กลุ่มส่งผล (เช็คอินแล้วเท่านั้น):</strong> {selectedCount > 0 ? `ผู้ร่วมที่เจาะจงเฉพาะตัวเลือก (${selectedCount} คน)` : `ผู้เช็คอินจริงทุกคน (${isCheckedOnly.length} คน)`}</p>
                      <p><strong>โครงการศึกษาอบรมสัมมนา:</strong> {selCourse?.title}</p>
                    </div>

                    {/* Modal Send Type Toggle */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 block">รูปแบบการจัดส่ง (Email Dispatch Method) *</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                        <button
                          type="button"
                          onClick={() => setModalSendType('individual')}
                          className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                            modalSendType === 'individual'
                              ? 'bg-white text-amber-600 shadow-2xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">✉️ ส่งแยกรายบุคคล</span>
                          <span className="text-[8px] opacity-75 font-normal">ระบุชื่อรายคน</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalSendType('group_to')}
                          className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                            modalSendType === 'group_to'
                              ? 'bg-white text-amber-600 shadow-2xs border border-slate-200/50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">📬 ส่งกลุ่ม To ทุกคน</span>
                          <span className="text-[8px] opacity-75 font-normal">To ทุกคน (เรียน อาจารย์ทุกท่าน)</span>
                        </button>
                      </div>
                    </div>

                    {/* CC Admin Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-lg border border-slate-150/50">
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-semibold text-slate-700 block">สำเนาถึงผู้ดูแลระบบ (CC to Admin)</span>
                          <span className="text-[9px] text-slate-500 block">ส่งสำเนาอีเมลนี้เพื่อใช้เก็บหลักฐาน</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={modalCcAdmin}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setModalCcAdmin(checked);
                              if (checked && modalCcEmails.length === 0 && userEmail) {
                                setModalCcEmails([userEmail.toLowerCase()]);
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>

                      {modalCcAdmin && (
                        <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg space-y-2 max-h-36 overflow-y-auto animate-fadeIn">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">เลือกรายชื่อผู้รับ CC (Admins to CC):</p>
                          {adminsList.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">ไม่พบรายชื่อแอดมินในระบบ</p>
                          ) : (
                            <div className="space-y-1">
                              {adminsList.map(adm => {
                                const isCurrentUser = adm.email.toLowerCase() === (userEmail || '').toLowerCase();
                                return (
                                  <label key={adm.email} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-100 p-0.5 rounded transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={modalCcEmails.includes(adm.email.toLowerCase())}
                                      onChange={(ev) => {
                                        const email = adm.email.toLowerCase();
                                        if (ev.target.checked) {
                                          setModalCcEmails(prev => [...prev, email]);
                                        } else {
                                          setModalCcEmails(prev => prev.filter(em => em !== email));
                                        }
                                      }}
                                      className="rounded text-amber-500 focus:ring-amber-500 h-3 w-3 border-slate-300"
                                    />
                                    <span className="truncate">
                                      <strong>{adm.name}</strong> <span className="text-slate-400 font-mono text-[9px]">({adm.email})</span> {isCurrentUser && <span className="ml-1 text-[9px] px-1 bg-amber-100 text-amber-700 font-bold rounded">คุณ</span>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-extrabold text-slate-700 block">ความสำคัญหัวข้อ (Email Subject)</label>
                      <input
                        type="text"
                        value={modalEmailSubject}
                        onChange={(e) => setModalEmailSubject(e.target.value)}
                        className="w-full text-xs text-slate-800 border border-slate-200 p-3 rounded-xl focus:border-amber-500 focus:ring-0 focus:outline-none font-bold"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-extrabold text-slate-700 block">พิมพ์คำอวยพรร่วมแสดงความยินดีประดับเว็บบอร์ด</label>
                      <textarea
                        value={modalEmailMessage}
                        onChange={(e) => setModalEmailMessage(e.target.value)}
                        rows={7}
                        className="w-full text-xs text-slate-850 border border-slate-200 p-3 rounded-xl focus:border-amber-500 focus:ring-0 focus:outline-none leading-relaxed font-sans"
                        placeholder="กรุณากรอกข้อมูลคำยินดี..."
                      />
                      <ImageToHtmlHelper onInsert={(htmlImg) => setModalEmailMessage(prev => prev + "\n" + htmlImg + "\n")} />
                      <p className="text-[10px] text-slate-400 font-medium leading-normal">
                        * ระบบจัดทำลิ้งก์ดาวน์โหลดและภาพเกียรติบัตรสลักชื่อเฉพาะรายให้โดยอัตโนมัติ: <code className="text-red-500 font-semibold">{`🎓 {learner_certificate_link}`}</code> ด้วยเทคโนโลยีการเจนภาพจากฝั่งผู้ใช้
                      </p>
                      <div className="mt-1.5 bg-amber-50/70 border border-amber-100 p-2.5 rounded-lg text-[10px] text-slate-600 space-y-1 leading-normal">
                        <p className="font-bold text-slate-700">🖼️ วิธีใส่รูปภาพในการแจ้งเตือน:</p>
                        <p>1. แทรกรูปโปสเตอร์คอร์สนี้อัตโนมัติ: พิมพ์ <code className="text-blue-600 bg-white px-1 py-0.2 rounded font-mono font-bold">{`{course_poster}`}</code> ลงในข้อความได้เลยค่ะ</p>
                        <p>2. ใส่รูปภาพจากเว็บไซต์ภายนอกด้วย HTML: <code className="text-slate-700 bg-white px-1 py-0.2 rounded font-mono">{`<img src="ลิงก์รูปภาพของคุณ" style="max-width:100%; border-radius:8px;"/>`}</code></p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        setSendingBulkEmail(true);
                        try {
                          await handleSendBulkEmailGroup(finalRecipients, modalEmailSubject, modalEmailMessage, true);
                          setShowCertificateModal(false);
                          setSelectedRegIds({}); // Clear selected checkboxes
                        } catch (err) {
                          alert('ข้อผิดพลาดการส่งสัมพัทธ์: ' + String(err));
                        } finally {
                          setSendingBulkEmail(false);
                        }
                      }}
                      disabled={sendingBulkEmail || !modalEmailSubject.trim() || !modalEmailMessage.trim()}
                      className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-slate-200 disabled:to-slate-300 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                    >
                      {sendingBulkEmail ? 'กำลังคอมไพล์สัญชาติและจัดส่งใบเกียรติบัตร...' : `ปล่อยเมลและแนบใบประกาศนียบัตรกลุ่ม (${finalRecipients.length} คน) ทันที`}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* BULK EMAIL COMPOSER MODAL */}
      {showBulkEmailModal && selectedCourseForEmail && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full uppercase">
                  Bulk Section Email Announcement
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 leading-snug">
                  ส่งอีเมลประกาศถึงผู้ลงทะเบียนหลักสูตรอบรมทั้งหมด
                </h3>
              </div>
              <button onClick={() => { setShowBulkEmailModal(false); setSelectedCourseForEmail(null); }} className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]">✕</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                <p><strong>หัวข้อหลักสูตร:</strong> {selectedCourseForEmail.title}</p>
                <p><strong>วิทยากรหลัก:</strong> {selectedCourseForEmail.speaker}</p>
                <p><strong>ผู้จะได้รับสาร:</strong> คนทั้งหมดที่ลงทะเบียนรอบนี้ ({registrations.filter(r => r.courseId === selectedCourseForEmail.id).length} บัญชี @bu.ac.th)</p>
              </div>

              {/* Bulk Send Type Toggle */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 block">รูปแบบการจัดส่ง (Email Dispatch Method) *</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setBulkSendType('individual')}
                    className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                      bulkSendType === 'individual'
                        ? 'bg-white text-blue-600 shadow-2xs border border-slate-200/50'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">✉️ ส่งแยกรายบุคคล</span>
                    <span className="text-[8px] opacity-75 font-normal">ระบุชื่อรายคน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSendType('group_to')}
                    className={`py-1.5 px-2 rounded-md text-center text-[11px] font-semibold transition flex flex-col items-center justify-center gap-0.5 ${
                      bulkSendType === 'group_to'
                        ? 'bg-white text-blue-600 shadow-2xs border border-slate-200/50'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">📬 ส่งกลุ่ม To ทุกคน</span>
                    <span className="text-[8px] opacity-75 font-normal">To ทุกคน (เรียน อาจารย์ทุกท่าน)</span>
                  </button>
                </div>
              </div>

              {/* CC Admin Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-lg border border-slate-150/50">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-slate-700 block">สำเนาถึงผู้ดูแลระบบ (CC to Admin)</span>
                    <span className="text-[9px] text-slate-500 block">ส่งสำเนาอีเมลนี้เพื่อใช้เก็บหลักฐาน</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={bulkCcAdmin}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setBulkCcAdmin(checked);
                        if (checked && bulkCcEmails.length === 0 && userEmail) {
                          setBulkCcEmails([userEmail.toLowerCase()]);
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>

                {bulkCcAdmin && (
                  <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg space-y-2 max-h-36 overflow-y-auto animate-fadeIn">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">เลือกรายชื่อผู้รับ CC (Admins to CC):</p>
                    {adminsList.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">ไม่พบรายชื่อแอดมินในระบบ</p>
                    ) : (
                      <div className="space-y-1">
                        {adminsList.map(adm => {
                          const isCurrentUser = adm.email.toLowerCase() === (userEmail || '').toLowerCase();
                          return (
                            <label key={adm.email} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer hover:bg-slate-100 p-0.5 rounded transition-colors">
                              <input
                                type="checkbox"
                                checked={bulkCcEmails.includes(adm.email.toLowerCase())}
                                onChange={(ev) => {
                                  const email = adm.email.toLowerCase();
                                  if (ev.target.checked) {
                                    setBulkCcEmails(prev => [...prev, email]);
                                  } else {
                                    setBulkCcEmails(prev => prev.filter(em => em !== email));
                                  }
                                }}
                                className="rounded text-blue-500 focus:ring-blue-500 h-3 w-3 border-slate-300"
                              />
                              <span className="truncate">
                                <strong>{adm.name}</strong> <span className="text-slate-400 font-mono text-[9px]">({adm.email})</span> {isCurrentUser && <span className="ml-1 text-[9px] px-1 bg-blue-100 text-blue-700 font-bold rounded">คุณ</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">พิมพ์เนื้อหาข่าวสารเอกสาร หรือ ลิงก์ดาวน์โหลดไดรฟ์</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setBulkViewTab('editor')}
                      className={`px-2 py-0.5 rounded font-bold transition ${bulkViewTab === 'editor' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      ✏️ เขียนเนื้อหา
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkViewTab('preview')}
                      className={`px-2 py-0.5 rounded font-bold transition ${bulkViewTab === 'preview' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      👁️ ตัวอย่างก่อนส่ง
                    </button>
                  </div>
                </div>

                {bulkViewTab === 'editor' ? (
                  <>
                    <textarea
                      placeholder="เรียน คณาจารย์ทุกท่าน, ขอส่งลิงค์ Google Drive เอกสารการอบรมหลังกิจกรรมนี้ดังต่อไปนี้...  "
                      value={bulkEmailMessage}
                      onChange={(e) => setBulkEmailMessage(e.target.value)}
                      rows={6}
                      className="w-full text-slate-800 border border-slate-200 p-3 rounded-lg text-xs font-sans leading-relaxed"
                      id="textarea-bulk-message"
                    />
                  </>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white p-4 space-y-3 font-sans">
                    <div className="bg-gradient-to-r from-blue-600 to-sky-500 text-white p-3 rounded-lg text-center">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-90">Bangkok University</h4>
                      <h3 className="text-sm font-extrabold">สำนักมาตรฐานคุณภาพการศึกษา</h3>
                    </div>
                    <div className="text-xs text-slate-600 font-bold border-b border-slate-100 pb-1">
                      เรื่อง: 📣 ข่าวสาร/เอกสารส่งต่อสำคัญจากหลักสูตร: {selectedCourseForEmail.title}
                    </div>
                    <div 
                      className="text-xs text-slate-800 leading-relaxed"
                      style={{
                        fontSize: emailTextFontSize,
                        textAlign: emailTextAlign,
                        lineHeight: emailLineHeight,
                        wordBreak: emailWrapMode === 'keep_all' ? 'keep-all' : 'normal',
                        overflowWrap: 'break-word',
                        lineBreak: 'loose',
                        whiteSpace: emailWrapMode === 'strict' ? 'pre-wrap' : 'normal'
                      }}
                      dangerouslySetInnerHTML={{
                        __html: formatMessageForHtml(bulkEmailMessage)
                      }}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleSendBulkEmail}
                disabled={sendingBulkEmail || !bulkEmailMessage.trim()}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow"
                id="btn-trigger-bulk-email-dispatcher"
              >
                {sendingBulkEmail ? 'กำลังเตรียมการจัดส่งสาร...' : 'สั่งส่งเมลกลุ่มถึงผู้มีรายชื่อทันที'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMPAIGN RECIPIENTS PREVIEW MODAL */}
      {showCampaignRecipientsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            
            {/* Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-orange-700 bg-orange-100 px-3 py-1 rounded-full uppercase font-mono">
                  Recipient Management Board
                </span>
                <h3 className="text-base font-extrabold text-slate-800 mt-2 leading-snug flex items-center gap-1.5">
                  <Users className="h-5 w-5 text-orange-600" />
                  <span>ตรวจสอบ แก้ไข และเพิ่ม/ลบ รายชื่อผู้รับจดหมายเชิญ ({getCampaignRecipients().length} รายการ)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ตรวจสอบความถูกต้องของรายชื่อ ตำแหน่ง สังกัด และอีเมลของกลุ่มเป้าหมาย คุณสามารถแก้ไข หรือเพิ่ม/ลบรายชื่อผู้รับได้อย่างอิสระก่อนกดจัดส่งจริงค่ะ
                </p>
              </div>
              <button 
                onClick={() => { setShowCampaignRecipientsModal(false); setCampaignRecipientsSearch(''); setShowAddPanel(false); }} 
                className="text-slate-400 hover:text-slate-700 p-2 text-lg font-bold min-h-[44px]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-hidden flex flex-col space-y-4">
              
              {/* Add & Filter Control Bar */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <span className="text-slate-500 text-[11px]">แสดง:</span>
                    <button
                      type="button"
                      onClick={() => setRecipientsFilterEmailStatus('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        recipientsFilterEmailStatus === 'all'
                          ? 'bg-white text-slate-850 shadow-2xs border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ทั้งหมด ({getCampaignRecipients().length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientsFilterEmailStatus('valid')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        recipientsFilterEmailStatus === 'valid'
                          ? 'bg-green-50 text-green-700 shadow-2xs border border-green-200 font-extrabold'
                          : 'text-slate-600 hover:text-green-700'
                      }`}
                    >
                      มีอีเมลพร้อมส่ง ({getCampaignRecipients().filter(r => r.email && r.email.trim().includes('@')).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientsFilterEmailStatus('missing')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                        recipientsFilterEmailStatus === 'missing'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : getCampaignRecipients().some(r => !r.email || !r.email.trim().includes('@'))
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold'
                          : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      {getCampaignRecipients().some(r => !r.email || !r.email.trim().includes('@')) && <span>⚠️</span>}
                      <span>ไม่มีอีเมล ({getCampaignRecipients().filter(r => !r.email || !r.email.trim().includes('@')).length})</span>
                    </button>
                  </div>

                  {getCampaignRecipients().some(r => !r.email || !r.email.trim().includes('@')) && (
                    <button
                      type="button"
                      onClick={() => {
                        const count = getCampaignRecipients().filter(r => !r.email || !r.email.trim().includes('@')).length;
                        setCampaignCustomRecipients(prev => prev.filter(r => r.email && r.email.trim().includes('@')));
                        alert(`ตัดรายชื่อที่ไม่มีอีเมลออกเรียบร้อยแล้ว ${count} คนค่ะ`);
                      }}
                      className="px-3 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                    >
                      <span>🚫 ตัดคนที่ไม่มีอีเมลออกจากกลุ่มนี้ ({getCampaignRecipients().filter(r => !r.email || !r.email.trim().includes('@')).length})</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Search Bar */}
                  <div className="relative md:col-span-8">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อ, รหัส, ตำแหน่ง, คณะ หรือ อีเมล ในกลุ่มผู้รับปัจจุบัน..."
                      value={campaignRecipientsSearch}
                      onChange={(e) => setCampaignRecipientsSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 pl-9 pr-4 py-2.5 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {/* Toggle Add Panel Button */}
                  <button
                    type="button"
                    onClick={() => setShowAddPanel(!showAddPanel)}
                    className={`md:col-span-4 h-10 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      showAddPanel 
                        ? 'bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-150' 
                        : 'bg-orange-600 hover:bg-orange-700 text-white shadow-xs'
                    }`}
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>{showAddPanel ? 'ปิดกล่องเพิ่มรายชื่อ' : 'เพิ่มรายชื่อนอกเป้าหมาย (+)'}</span>
                  </button>
                </div>
              </div>

              {/* Add Recipients Panel (Expandable) */}
              {showAddPanel && (
                <div className="p-4 bg-orange-50/50 border border-orange-200 rounded-2xl grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-150">
                  
                  {/* Left Column: Search & Add from Database */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-orange-950 flex items-center gap-1">
                      <Search className="h-3.5 w-3.5" />
                      <span>วิธีที่ 1: ค้นหาจากฐานข้อมูลและคลิกเลือกเพื่อเพิ่ม</span>
                    </h4>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="พิมพ์เพื่อค้นหาพนักงานที่จะเพิ่ม..."
                        value={modalSearchQuery}
                        onChange={(e) => setModalSearchQuery(e.target.value)}
                        className="w-full bg-white border border-slate-200 pl-8 pr-3 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    {modalSearchQuery.trim().length > 0 && (
                      <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto bg-white shadow-xs divide-y divide-slate-100">
                        {(() => {
                          const query = modalSearchQuery.toLowerCase().trim();
                          const matches = personnel.filter(p => 
                            p.name.toLowerCase().includes(query) || 
                            p.id.toLowerCase().includes(query) ||
                            (p.email || '').toLowerCase().includes(query) ||
                            (p.position || '').toLowerCase().includes(query) ||
                            (p.department || '').toLowerCase().includes(query)
                          ).slice(0, 5);

                          if (matches.length === 0) {
                            return <div className="p-2 text-xs text-slate-400 text-center">ไม่พบผลลัพธ์ข้อมูลบุคลากร</div>;
                          }

                          return matches.map(person => {
                            const isAdded = campaignCustomRecipients.some(cr => cr.id === person.id);
                            return (
                              <div key={person.id} className="p-2 flex items-center justify-between hover:bg-slate-50 transition text-xs">
                                <div className="text-left pr-2 overflow-hidden">
                                  <div className="font-bold text-slate-850 truncate">{person.name}</div>
                                  <div className="text-[10px] text-slate-500 font-mono truncate">
                                    {person.id} • {person.position} • {person.department}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isAdded) {
                                      removeCampaignRecipient(person.id);
                                    } else {
                                      addCampaignRecipient(person);
                                    }
                                  }}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex-shrink-0 ${
                                    isAdded 
                                      ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100' 
                                      : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
                                  }`}
                                >
                                  {isAdded ? 'ลบออก' : 'เลือกเพิ่ม'}
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Manual Form Addition */}
                  <div className="space-y-2 border-t lg:border-t-0 lg:border-l border-orange-200/60 lg:pl-6 pt-3 lg:pt-0">
                    <h4 className="text-xs font-bold text-orange-950 flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      <span>วิธีที่ 2: กรอกข้อมูลเอง (แบบแมนนวล / ผู้รับภายนอก)</span>
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="ชื่อ-นามสกุล *"
                        value={manualAddName}
                        onChange={(e) => setManualAddName(e.target.value)}
                        className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none"
                      />
                      <input
                        type="email"
                        placeholder="อีเมลผู้รับ *"
                        value={manualAddEmail}
                        onChange={(e) => setManualAddEmail(e.target.value)}
                        className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="รหัสพนักงาน (ถ้ามี)"
                        value={manualAddId}
                        onChange={(e) => setManualAddId(e.target.value)}
                        className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none font-mono"
                      />
                      <input
                        type="text"
                        placeholder="ตำแหน่ง (เช่น คณบดี)"
                        value={manualAddPos}
                        onChange={(e) => setManualAddPos(e.target.value)}
                        className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="หน่วยงาน/คณะ"
                        value={manualAddDept}
                        onChange={(e) => setManualAddDept(e.target.value)}
                        className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs text-slate-800 focus:outline-none col-span-2"
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!manualAddName.trim() || !manualAddEmail.trim()) {
                            alert('กรุณากรอกชื่อและอีเมลให้ครบถ้วนด้วยค่ะ');
                            return;
                          }
                          const tempId = `temp-${Date.now()}`;
                          const newPerson: Personnel = {
                            id: manualAddId.trim() || tempId,
                            name: manualAddName.trim(),
                            email: manualAddEmail.trim(),
                            position: manualAddPos.trim() || 'ทั่วไป',
                            department: manualAddDept.trim() || 'ภายนอก/อื่นๆ',
                            phone: '',
                            createdAt: new Date().toISOString()
                          };
                          setCampaignCustomRecipients(prev => [...prev, newPerson]);
                          setManualAddName('');
                          setManualAddEmail('');
                          setManualAddId('');
                          setManualAddDept('');
                          setManualAddPos('');
                        }}
                        className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition shadow-3xs"
                      >
                        บีบอัดเพิ่มรายชื่อนี้
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scrollable Recipient Table Wrapper */}
              <div className="flex-1 overflow-auto border border-slate-150 rounded-2xl shadow-3xs bg-white">
                <table className="w-full border-collapse text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-150">
                    <tr className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 w-12 text-center">ที่</th>
                      <th className="py-3 px-3 w-28">รหัสพนักงาน</th>
                      <th className="py-3 px-3 w-44">ชื่อ-นามสกุล</th>
                      <th className="py-3 px-3 w-36">ตำแหน่ง</th>
                      <th className="py-3 px-3 w-40">หน่วยงาน/สังกัด</th>
                      <th className="py-3 px-3 w-48">อีเมล</th>
                      <th className="py-3 px-4 text-center w-28">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(() => {
                      const list = getCampaignRecipients();
                      const filtered = list.filter(p => {
                        const hasEmail = Boolean(p.email && p.email.trim().includes('@'));
                        if (recipientsFilterEmailStatus === 'missing' && hasEmail) return false;
                        if (recipientsFilterEmailStatus === 'valid' && !hasEmail) return false;

                        const q = campaignRecipientsSearch.toLowerCase().trim();
                        if (!q) return true;
                        return p.name.toLowerCase().includes(q) ||
                          p.id.toLowerCase().includes(q) ||
                          (p.position || '').toLowerCase().includes(q) ||
                          p.department.toLowerCase().includes(q) ||
                          (p.email || '').toLowerCase().includes(q);
                      });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                              ไม่พบข้อมูลผู้รับเมลที่ตรงกับเงื่อนไขคำค้นหาหรือตัวกรองในปัจจุบัน
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((person, idx) => {
                        const isEditing = editingRecipientId === person.id;
                        const hasValidEmail = Boolean(person.email && person.email.trim().includes('@'));

                        return (
                          <tr key={person.id} className={`hover:bg-slate-50/70 duration-75 ${isEditing ? 'bg-amber-50/40' : !hasValidEmail ? 'bg-rose-50/20' : ''}`}>
                            <td className="py-3 px-4 text-center font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                            
                            {/* Employee ID */}
                            <td className="py-2 px-3 font-mono">
                              {isEditing ? (
                                <span className="text-slate-500 font-semibold">{person.id}</span>
                              ) : (
                                <span className="font-bold text-slate-900">{person.id}</span>
                              )}
                            </td>

                            {/* Name */}
                            <td className="py-2 px-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="font-semibold text-slate-900">{person.name}</span>
                              )}
                            </td>

                            {/* Position */}
                            <td className="py-2 px-3 text-slate-600">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingPosition}
                                  onChange={(e) => setEditingPosition(e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-850 focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="bg-slate-100 text-slate-755 px-2 py-0.5 rounded text-[10px] font-bold truncate block max-w-[130px]" title={person.position || '-'}>
                                  {person.position || '-'}
                                </span>
                              )}
                            </td>

                            {/* Department */}
                            <td className="py-2 px-3 text-slate-500">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingDepartment}
                                  onChange={(e) => setEditingDepartment(e.target.value)}
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-850 focus:outline-none focus:border-orange-500"
                                />
                              ) : (
                                <span className="truncate block max-w-[140px]" title={person.department}>
                                  {person.department}
                                </span>
                              )}
                            </td>

                            {/* Email */}
                            <td className="py-2 px-3 text-blue-600 font-mono text-[11px]">
                              {isEditing ? (
                                <input
                                  type="email"
                                  value={editingEmail}
                                  onChange={(e) => setEditingEmail(e.target.value)}
                                  placeholder="อีเมลผู้รับ..."
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:border-orange-500"
                                />
                              ) : hasValidEmail ? (
                                <span>{person.email}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRecipientId(person.id);
                                    setEditingName(person.name);
                                    setEditingEmail(person.email || '');
                                    setEditingPosition(person.position || '');
                                    setEditingDepartment(person.department || '');
                                  }}
                                  className="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded cursor-pointer transition flex items-center gap-1"
                                >
                                  <span>⚠️ ไม่มีอีเมล (คลิกกรอก)</span>
                                </button>
                              )}
                            </td>

                            {/* Management Actions */}
                            <td className="py-2 px-4 text-center whitespace-nowrap">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!editingName.trim()) {
                                        alert('กรุณากรอกชื่อด้วยค่ะ');
                                        return;
                                      }
                                      const newEmail = editingEmail.trim();
                                      setCampaignCustomRecipients(prev => prev.map(cr => {
                                        if (cr.id === person.id) {
                                          return {
                                            ...cr,
                                            name: editingName.trim(),
                                            email: newEmail,
                                            position: editingPosition.trim(),
                                            department: editingDepartment.trim()
                                          };
                                        }
                                        return cr;
                                      }));

                                      // Persist to personnel collection if it exists
                                      const pDoc = personnel.find(p => p.id === person.id);
                                      if (pDoc) {
                                        try {
                                          await updateDoc(doc(db, 'personnel', pDoc.id), {
                                            name: editingName.trim(),
                                            email: newEmail,
                                            position: editingPosition.trim(),
                                            department: editingDepartment.trim()
                                          });
                                        } catch (e) {
                                          console.warn("Could not sync personnel update to firestore:", e);
                                        }
                                      }

                                      setEditingRecipientId(null);
                                    }}
                                    className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer"
                                    title="บันทึกข้อมูล"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingRecipientId(null)}
                                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition text-xs font-bold font-mono cursor-pointer"
                                    title="ยกเลิก"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRecipientId(person.id);
                                      setEditingName(person.name);
                                      setEditingEmail(person.email);
                                      setEditingPosition(person.position || '');
                                      setEditingDepartment(person.department || '');
                                    }}
                                    className="p-1 hover:bg-amber-50 text-amber-500 hover:text-amber-700 rounded transition"
                                    title="แก้ไขข้อมูลผู้รับท่านนี้"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeCampaignRecipient(person.id)}
                                    className="p-1 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition"
                                    title="ลบรายชื่อท่านนี้ออกจากกลุ่มส่งเมลนี้"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Stats Footer of the Modal */}
              <div className="flex justify-between items-center text-xs text-slate-500 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                <span>
                  แสดงผล <strong>
                    {getCampaignRecipients().filter(p => {
                      const q = campaignRecipientsSearch.toLowerCase().trim();
                      if (!q) return true;
                      return p.name.toLowerCase().includes(q) ||
                        p.id.toLowerCase().includes(q) ||
                        (p.position || '').toLowerCase().includes(q) ||
                        p.department.toLowerCase().includes(q) ||
                        p.email.toLowerCase().includes(q);
                    }).length}
                  </strong> รายการ จากผู้ส่งเป้าหมายทั้งหมด <strong>{getCampaignRecipients().length}</strong> คน
                </span>
                <button
                  type="button"
                  onClick={() => { setShowCampaignRecipientsModal(false); setCampaignRecipientsSearch(''); setShowAddPanel(false); }}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 rounded-xl transition shadow-sm text-xs"
                >
                  บันทึกความเปลี่ยนแปลงและปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULL EMAIL PRE-SEND PREVIEW & WORD-BREAK ADJUSTMENT MODAL */}
      {showPreSendModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-600 rounded-xl text-white shadow-sm">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <span>ตรวจสอบตัวอย่างอีเมลก่อนส่ง (Pre-Send Preview)</span>
                    <span className="text-[10px] bg-green-500/30 text-green-300 border border-green-500/50 px-2 py-0.5 rounded-full font-bold">
                      พร้อมส่ง {getCampaignRecipients().filter(r => r.email && r.email.trim().includes('@')).length} คน
                    </span>
                    {getCampaignRecipients().some(r => !r.email || !r.email.trim().includes('@')) && (
                      <span className="text-[10px] bg-rose-500/30 text-rose-300 border border-rose-500/50 px-2 py-0.5 rounded-full font-bold">
                        ⚠️ ไม่มีอีเมล {getCampaignRecipients().filter(r => !r.email || !r.email.trim().includes('@')).length} คน (ระบบจะข้าม)
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ทดสอบการแสดงผลบนขนาดหน้าจอต่างๆ ปรับแต่งข้อความได้ทันทีก่อนยืนยันการจัดส่ง
                  </p>
                </div>
              </div>

              {/* Viewport Width Controls */}
              <div className="flex items-center gap-2">
                <div className="bg-slate-800 p-1 rounded-xl flex items-center gap-1 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      previewViewport === 'desktop'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title="มุมมองจอคอมพิวเตอร์ (600px)"
                  >
                    <span>💻 จอคอม (600px)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      previewViewport === 'mobile'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title="มุมมองจอมือถือ (375px)"
                  >
                    <span>📱 มือถือ (375px)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('narrow')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      previewViewport === 'narrow'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                    title="มุมมองจอแคบพิเศษ (320px)"
                  >
                    <span>📱 จอแคบ (320px)</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPreSendModal(false)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer text-base"
                  title="ปิดหน้าต่าง"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Responsive Screen Tab Switcher (< lg) */}
            <div className="lg:hidden bg-slate-100 border-b border-slate-200 p-2 flex items-center justify-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPreSendModalTab('editor')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  preSendModalTab === 'editor'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                <Edit className="h-3.5 w-3.5" />
                <span>✏️ ปรับแต่งข้อความ</span>
              </button>
              <button
                type="button"
                onClick={() => setPreSendModalTab('preview')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  preSendModalTab === 'preview'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>👁️ ดูตัวอย่างจดหมาย ({getCampaignRecipients().length} คน)</span>
              </button>
            </div>

            {/* Modal Body: Split into Editor on Left, Live View on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
              {/* Left Column: Quick Live Editor (5 cols) */}
              <div className={`lg:col-span-5 border-r border-slate-200 bg-slate-50/70 p-4 overflow-y-auto flex flex-col justify-between space-y-3 ${
                preSendModalTab === 'editor' ? 'flex' : 'hidden lg:flex'
              }`}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                    <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <Edit className="h-3.5 w-3.5 text-orange-600" />
                      <span>ปรับแก้ข้อความ (Live Editor)</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">
                      พิมพ์แล้วพรีวิวขวามืออัปเดตสด
                    </span>
                  </div>

                  {/* Typography & Alignment Controls */}
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-3xs space-y-2 text-xs">
                    <span className="text-[10px] font-bold text-slate-600 block uppercase tracking-wider">
                      ⚙️ ตั้งค่าการแสดงผลตัวอักษร:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <label className="text-slate-400 block mb-0.5 font-semibold">ขนาดตัวอักษร:</label>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                          {(['13px', '14px', '15px'] as const).map(size => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setEmailTextFontSize(size)}
                              className={`flex-1 py-1 rounded text-center font-bold transition ${emailTextFontSize === size ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-0.5 font-semibold">การจัดแนวข้อความ:</label>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => setEmailTextAlign('left')}
                            className={`flex-1 py-1 rounded text-center font-bold transition ${emailTextAlign === 'left' ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            ชิดซ้าย
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmailTextAlign('justify')}
                            className={`flex-1 py-1 rounded text-center font-bold transition ${emailTextAlign === 'justify' ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            กระจายเต็ม
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-0.5 font-semibold">ระยะห่างบรรทัด:</label>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                          {(['1.6', '1.75', '2.0'] as const).map(lh => (
                            <button
                              key={lh}
                              type="button"
                              onClick={() => setEmailLineHeight(lh)}
                              className={`flex-1 py-1 rounded text-center font-bold transition ${emailLineHeight === lh ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              {lh}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-slate-400 block mb-0.5 font-semibold">โหมดตัดคำ:</label>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => setEmailWrapMode('natural')}
                            className={`flex-1 py-1 rounded text-center font-bold transition text-[9px] ${emailWrapMode === 'natural' ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                            title="คำไทยธรรมชาติ"
                          >
                            ธรรมชาติ
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmailWrapMode('keep_all')}
                            className={`flex-1 py-1 rounded text-center font-bold transition text-[9px] ${emailWrapMode === 'keep_all' ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                            title="ไม่แยกคำย่อย"
                          >
                            ไม่แยกคำ
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmailWrapMode('strict')}
                            className={`flex-1 py-1 rounded text-center font-bold transition text-[9px] ${emailWrapMode === 'strict' ? 'bg-orange-600 text-white shadow-3xs' : 'text-slate-600 hover:text-slate-900'}`}
                            title="ตามที่เคาะจริง"
                          >
                            ตามเคาะ
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subject Input */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">หัวเรื่องอีเมล (Subject)</label>
                    <input
                      type="text"
                      value={campaignSubject}
                      onChange={(e) => setCampaignSubject(e.target.value)}
                      className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs font-semibold text-slate-850"
                    />
                  </div>

                  {/* Message Textarea */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 block">
                      เนื้อหาจดหมาย
                    </label>
                    <textarea
                      rows={11}
                      value={campaignMessage}
                      onChange={(e) => setCampaignMessage(e.target.value)}
                      className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-xs text-slate-850 leading-relaxed font-mono focus:ring-1 focus:ring-orange-500 focus:outline-none"
                      placeholder="พิมพ์เนื้อหาที่นี่..."
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Realistic Preview (7 cols) */}
              <div 
                ref={modalPreviewScrollRef} 
                className={`lg:col-span-7 bg-slate-100/70 p-4 sm:p-6 overflow-y-auto overscroll-contain flex flex-col items-center scroll-smooth pb-28 ${
                  preSendModalTab === 'preview' ? 'flex' : 'hidden lg:flex'
                }`}
              >
                {(() => {
                  const modalRecipients = getCampaignRecipients();
                  const hasRecipients = modalRecipients.length > 0;
                  const safeModalIdx = hasRecipients ? Math.min(Math.max(0, previewRecipientIndex), modalRecipients.length - 1) : 0;
                  const currentModalRecipient = hasRecipients ? modalRecipients[safeModalIdx] : null;
                  const activeModalPerson = campaignSendType === 'individual'
                    ? currentModalRecipient
                    : { id: 'all', name: 'ทุกท่าน', email: '', position: 'อาจารย์', department: 'มหาวิทยาลัยกรุงเทพ', phone: '', createdAt: '' };
                  const selCourse = courses.find(c => c.id === campaignCourseId) || null;

                  return (
                    <>
                      <div className="w-full max-w-2xl mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-bold px-1">
                        <div className="flex items-center gap-2">
                          <span>ตัวอย่างเสมือนจริง: {previewViewport === 'narrow' ? '📱 จอแคบ (320px)' : previewViewport === 'mobile' ? '📱 จอมือถือ (375px)' : '💻 จอคอมพิวเตอร์ (600px)'}</span>
                        </div>

                        {/* Fast Scroll to Bottom & Top buttons */}
                        <div className="flex items-center gap-1 text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              if (modalPreviewScrollRef.current) {
                                modalPreviewScrollRef.current.scrollTo({ top: modalPreviewScrollRef.current.scrollHeight, behavior: 'smooth' });
                              }
                            }}
                            className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-2xs font-bold transition cursor-pointer"
                            title="เลื่อนดูเนื้อหาท้ายจดหมายและปุ่มลงทะเบียน"
                          >
                            ⬇️ เลื่อนดูด้านล่างสุด
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (modalPreviewScrollRef.current) {
                                modalPreviewScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }}
                            className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg shadow-2xs font-bold transition cursor-pointer"
                            title="เลื่อนกลับไปบนสุด"
                          >
                            ⬆️ บนสุด
                          </button>
                        </div>
                      </div>

                      {/* Recipient switcher banner in modal */}
                      {campaignSendType === 'individual' && hasRecipients && (
                        <div className="w-full max-w-2xl mb-3 bg-white border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-extrabold text-slate-800">👤 แสดงตัวอย่างสำหรับ:</span>
                            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 truncate max-w-[200px]">
                              {currentModalRecipient?.name || '-'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <button
                              type="button"
                              onClick={() => setPreviewRecipientIndex(prev => Math.max(0, prev - 1))}
                              disabled={safeModalIdx <= 0}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded-lg text-slate-700 font-bold transition cursor-pointer"
                              title="คนก่อนหน้า"
                            >
                              ◀
                            </button>
                            <select
                              value={safeModalIdx}
                              onChange={(e) => setPreviewRecipientIndex(Number(e.target.value))}
                              className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 cursor-pointer max-w-[190px] truncate"
                            >
                              {modalRecipients.map((r, idx) => (
                                <option key={r.id || idx} value={idx}>
                                  #{idx + 1} {r.name} ({r.department || 'ไม่ระบุ'})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setPreviewRecipientIndex(prev => Math.min(modalRecipients.length - 1, prev + 1))}
                              disabled={safeModalIdx >= modalRecipients.length - 1}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded-lg text-slate-700 font-bold transition cursor-pointer"
                              title="คนถัดไป"
                            >
                              ▶
                            </button>
                            <span className="text-[10px] text-slate-400 font-mono ml-1">
                              ({safeModalIdx + 1}/{modalRecipients.length})
                            </span>
                          </div>
                        </div>
                      )}

                      <div 
                        style={{ 
                          width: previewViewport === 'narrow' ? '320px' : previewViewport === 'mobile' ? '375px' : '100%',
                          maxWidth: previewViewport === 'narrow' ? '320px' : previewViewport === 'mobile' ? '375px' : '600px'
                        }}
                        className="transition-all duration-300 bg-white border border-slate-250 rounded-2xl overflow-hidden shadow-md"
                      >
                        {/* Email Banner */}
                        <div className="bg-gradient-to-r from-orange-600 to-amber-500 text-white p-5 text-center relative">
                          <Landmark className="h-8 w-8 text-white/90 mx-auto" />
                          <h4 className="text-xs font-mono tracking-widest text-orange-100 font-bold uppercase mt-1">Bangkok University</h4>
                          <h3 className="text-sm font-extrabold mt-1 tracking-tight">สำนักมาตรฐานคุณภาพการศึกษา</h3>
                        </div>

                        {/* Email Content */}
                        <div className="p-5 space-y-4">
                          {/* Formatted Message text */}
                          <div 
                            className="text-slate-800 font-medium"
                            style={{
                              fontSize: emailTextFontSize,
                              textAlign: emailTextAlign,
                              lineHeight: emailLineHeight,
                              wordBreak: emailWrapMode === 'keep_all' ? 'keep-all' : 'normal',
                              overflowWrap: 'break-word',
                              lineBreak: 'loose',
                              whiteSpace: emailWrapMode === 'strict' ? 'pre-wrap' : 'normal'
                            }}
                            dangerouslySetInnerHTML={{
                              __html: renderTemplate(
                                formatMessageForHtml(campaignMessage), 
                                activeModalPerson, 
                                selCourse,
                                campaignSendType !== 'individual'
                              )
                            }}
                          />

                          {/* Poster fallback */}
                          {!(campaignMessage.includes('{course_poster}') || campaignMessage.includes('{course_poster_html}') || campaignMessage.includes('{course_poster_url}')) && selCourse?.posterUrl && (
                            <div className="text-center my-3">
                              <img 
                                src={selCourse?.posterUrl} 
                                alt="โปสเตอร์อบรม" 
                                className="max-h-72 max-w-full rounded-lg mx-auto shadow-sm border border-slate-200"
                              />
                            </div>
                          )}

                          <hr className="border-slate-100" />
                          
                          {/* Course Info Card */}
                          <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-2 text-xs text-slate-700">
                            <p className="font-extrabold text-slate-900 border-b border-slate-150 pb-1.5 flex items-center justify-between">
                              <span>📋 สรุปรายละเอียดกำหนดการสัมมนา:</span>
                              <span className="text-[9px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded font-extrabold">รอบจองสิทธิ์ด่วน</span>
                            </p>
                            {selCourse ? (
                              <>
                                <p className="font-bold text-slate-850">
                                  หัวข้อ: {selCourse.title}
                                </p>
                                <p>วิทยากร: 👨‍🏫 <strong>{selCourse.speaker}</strong></p>
                                <p>วันเวลา: 📅 {selCourse.date} เวลา {selCourse.time} น.</p>
                                <p>สถานที่: 📍 {selCourse.location}</p>
                              </>
                            ) : (
                              <p className="text-slate-400 italic">เลือกหลักสูตรเพื่อดูรายละเอียด</p>
                            )}
                          </div>

                          {/* Register Button */}
                          <div className="text-center pt-2">
                            <button
                              type="button"
                              className="w-full bg-orange-600 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md flex items-center justify-center gap-1 cursor-default"
                            >
                              <span>👉 คลิกที่นี่เพื่อลงทะเบียนจองสิทธิ์เข้าร่วมอบรม</span>
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="text-[10px] text-slate-400 text-center leading-normal pt-2 border-t border-slate-100 pb-8">
                            จดหมายฉบับนี้ส่งถึงคุณโดยระบบอัตโนมัติภายใต้โครงข่ายความรู้ส่วนกลาง มหาวิทยาลัยกรุงเทพ<br />
                            สำนักมาตรฐานคุณภาพการศึกษา
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowPreSendModal(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                ✕ ปิด / กลับไปแก้ไขต่อ
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreSendModal(false);
                    handleSendCampaignEmails();
                  }}
                  disabled={sendingCampaignMessage || getCampaignRecipients().length === 0}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Send className="h-4 w-4" />
                  <span>🚀 ยืนยันและเริ่มส่งจดหมาย ({getCampaignRecipients().length} คน)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal สำหรับแก้ไขข้อมูลผู้เข้าร่วมอบรม */}
      {editingRegistration && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 shadow-2xl" id="modal-edit-registration">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit className="h-5 w-5 text-amber-500" />
                <span>แก้ไขข้อมูลผู้ลงทะเบียน / ผู้เข้าอบรม</span>
              </h3>
              <button 
                onClick={() => setEditingRegistration(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-50 transition"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">รหัสพนักงาน / บุคลากร *</label>
                <input
                  type="text"
                  value={editRegForm.personnelId}
                  onChange={(e) => setEditRegForm({ ...editRegForm, personnelId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ชื่อ-นามสกุล *</label>
                <input
                  type="text"
                  value={editRegForm.name}
                  onChange={(e) => setEditRegForm({ ...editRegForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ตำแหน่ง</label>
                <input
                  type="text"
                  value={editRegForm.position}
                  onChange={(e) => setEditRegForm({ ...editRegForm, position: e.target.value })}
                  placeholder="เช่น อาจารย์, เจ้าหน้าที่บริหารงานทั่วไป"
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">อีเมลติดต่อ (@bu.ac.th) *</label>
                <input
                  type="email"
                  value={editRegForm.email}
                  onChange={(e) => setEditRegForm({ ...editRegForm, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-850 font-mono focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">หน่วยงาน / สังกัด *</label>
                <input
                  type="text"
                  value={editRegForm.department}
                  onChange={(e) => setEditRegForm({ ...editRegForm, department: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="edit-reg-checked-in"
                  checked={editRegForm.checkedIn}
                  onChange={(e) => setEditRegForm({ ...editRegForm, checkedIn: e.target.checked })}
                  className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4 shadow-sm cursor-pointer"
                />
                <label htmlFor="edit-reg-checked-in" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  ผ่านการเช็คอินเข้าอบรมเรียบร้อยแล้ว
                </label>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingRegistration(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition min-h-[38px]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveRegistrationEdit}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-sm min-h-[38px]"
              >
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal สำหรับแก้ไขข้อมูลแอดมินเจ้าหน้าที่ */}
      {editingAdminState && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 shadow-2xl" id="modal-edit-admin">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit className="h-5 w-5 text-amber-500" />
                <span>แก้ไขข้อมูลแอดมินเจ้าหน้าที่ / ผู้ร่วมบริหาร</span>
              </h3>
              <button 
                onClick={() => setEditingAdminState(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-50 transition"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">อีเมลสิทธิ์แอดมิน (@bu.ac.th) *</label>
                <input
                  type="email"
                  value={editAdminForm.email}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-850 font-mono focus:outline-none focus:border-amber-500 min-h-[38px] disabled:opacity-55"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ชื่อ-นามสกุลจริง *</label>
                <input
                  type="text"
                  value={editAdminForm.name}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">รหัสบุคลากร</label>
                <input
                  type="text"
                  value={editAdminForm.staffId}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, staffId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-850 focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ตำแหน่ง</label>
                <input
                  type="text"
                  value={editAdminForm.position}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, position: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">หน่วยงาน / สังกัด</label>
                <input
                  type="text"
                  value={editAdminForm.department}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, department: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">เบอร์โทรศัพท์</label>
                <input
                  type="text"
                  value={editAdminForm.phone}
                  onChange={(e) => setEditAdminForm({ ...editAdminForm, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ประเภทสิทธิ์การอนุมัติข้อมูล (Role)</label>
                <input
                  type="text"
                  value="Admin (ผู้ดูแลระบบ)"
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-500 font-semibold min-h-[38px]"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingAdminState(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition min-h-[38px]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveAdminEdit}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-sm min-h-[38px]"
              >
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal สำหรับแก้ไขประวัติส่งเมล (Edit Campaign Log) */}
      {editingCampaignLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 shadow-2xl" id="modal-edit-campaign-log">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150 scrollbar-thin">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit className="h-5 w-5 text-orange-500" />
                <span>แก้ไขรายละเอียดประวัติการจัดส่งเมลเชิญ</span>
              </h3>
              <button 
                onClick={() => setEditingCampaignLog(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-50 transition"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ชื่อหลักสูตรอบรม *</label>
                <input
                  type="text"
                  value={editCampaignForm.courseTitle || ''}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, courseTitle: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:border-orange-500 min-h-[38px]"
                  placeholder="เช่น อบรมแนวทางตามเกณฑ์ AUN-QA version 4"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">รหัสอ้างอิงหลักสูตร (Course ID)</label>
                  <input
                    type="text"
                    value={editCampaignForm.courseId || ''}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, courseId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-orange-500 min-h-[38px]"
                    placeholder="เช่น manual หรือรหัสคอร์สจริง"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">กลุ่มเป้าหมายที่ระบุ *</label>
                  <input
                    type="text"
                    value={editCampaignForm.targetDetails || ''}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, targetDetails: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-orange-500 min-h-[38px]"
                    placeholder="เช่น อาจารย์ประจำ คณะบัญชี หรือ เจาะจงรายบุคคล"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">หัวข้ออีเมล (Subject Line) *</label>
                <input
                  type="text"
                  value={editCampaignForm.subject || ''}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, subject: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:border-orange-500 min-h-[38px]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">เนื้อหาอีเมลส่งเชิญ (Template / Message) *</label>
                <textarea
                  value={editCampaignForm.message || ''}
                  onChange={(e) => setEditCampaignForm({ ...editCampaignForm, message: e.target.value })}
                  rows={6}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:border-orange-500"
                ></textarea>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-orange-50/40 p-4 rounded-xl border border-orange-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-orange-800 block">จำนวนเป้าหมายรวม *</label>
                  <input
                    type="number"
                    value={editCampaignForm.recipientsCount || 0}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, recipientsCount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-250 p-2 rounded-lg text-xs font-bold text-slate-800 min-h-[34px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-emerald-800 block">ส่งสำเร็จ *</label>
                  <input
                    type="number"
                    value={editCampaignForm.successCount || 0}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, successCount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-250 p-2 rounded-lg text-xs font-bold text-emerald-700 min-h-[34px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-800 block">ส่งล้มเหลว *</label>
                  <input
                    type="number"
                    value={editCampaignForm.failCount || 0}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, failCount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-250 p-2 rounded-lg text-xs font-bold text-rose-700 min-h-[34px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">ผู้ดำเนินการส่ง *</label>
                  <input
                    type="text"
                    value={editCampaignForm.sentBy || ''}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, sentBy: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:border-orange-500 min-h-[38px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">วันเวลาที่ส่ง (Sent At ISO) *</label>
                  <input
                    type="text"
                    value={editCampaignForm.sentAt || ''}
                    onChange={(e) => setEditCampaignForm({ ...editCampaignForm, sentAt: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:border-orange-500 min-h-[38px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingCampaignLog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition min-h-[38px]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveCampaignLogEdit}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-sm min-h-[38px]"
              >
                บันทึกประวัติจัดส่ง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal สำหรับลงบันทึกแมนนวล (Add Manual Campaign Log) */}
      {showAddCampaignModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 shadow-2xl" id="modal-add-campaign-log">
          <div className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150 scrollbar-thin">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-emerald-500" />
                <span>ลงบันทึกประวัติการส่งจดหมายเชิญแบบกำหนดเอง (Manual Log)</span>
              </h3>
              <button 
                onClick={() => setShowAddCampaignModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-50 transition"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">เลือกหลักสูตรอบรมเป้าหมาย *</label>
                <select
                  value={addCampaignForm.courseId || ''}
                  onChange={(e) => {
                    const cid = e.target.value;
                    if (cid === 'custom') {
                      setAddCampaignForm({
                        ...addCampaignForm,
                        courseId: 'custom',
                        courseTitle: ''
                      });
                    } else {
                      const found = courses.find(c => c.id === cid);
                      setAddCampaignForm({
                        ...addCampaignForm,
                        courseId: cid,
                        courseTitle: found ? found.title : ''
                      });
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 min-h-[38px]"
                >
                  <option value="">-- กรุณาเลือกหลักสูตร หรือ เลือกกรอกด้วยตนเอง --</option>
                  {courses.filter(c => !c.archived || c.id === addCampaignForm.courseId || showArchivedInDropdown).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.archived ? '📁 [จัดเก็บแล้ว] ' : ''}{c.title}
                    </option>
                  ))}
                  <option value="custom">✍️ ระบุหลักสูตรเอง (คีย์ข้อมูลเองแมนนวล)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">ชื่อหลักสูตรอบรม (Course Activity) *</label>
                <input
                  type="text"
                  value={addCampaignForm.courseTitle || ''}
                  onChange={(e) => setAddCampaignForm({ ...addCampaignForm, courseTitle: e.target.value })}
                  disabled={addCampaignForm.courseId !== 'custom' && !!addCampaignForm.courseId}
                  className="w-full disabled:bg-slate-100 bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500 min-h-[38px]"
                  placeholder="เช่น โครงการพัฒนาสมรรถนะอาจารย์ยุคใหม่"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">กลุ่มเป้าหมาย (Target Details) *</label>
                  <input
                    type="text"
                    value={addCampaignForm.targetDetails || ''}
                    onChange={(e) => setAddCampaignForm({ ...addCampaignForm, targetDetails: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 min-h-[38px]"
                    placeholder="เช่น อาจารย์ประจำคณะบริหารธุรกิจ, เจาะจงรายบุคคล"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">ประเภทกลุ่มเป้าหมาย</label>
                  <select
                    value={addCampaignForm.targetType || 'all'}
                    onChange={(e) => setAddCampaignForm({ ...addCampaignForm, targetType: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:border-emerald-500 min-h-[38px]"
                  >
                    <option value="all">บุคลากรทั้งหมด (All)</option>
                    <option value="custom_dept">เฉพาะสาขา/สังกัด (Department)</option>
                    <option value="position">เฉพาะตำแหน่ง (Position)</option>
                    <option value="specific_personnel">รายบุคคลจำกัดสิทธิ์ (Specific Personnel)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">หัวข้ออีเมล (Subject Line) *</label>
                <input
                  type="text"
                  value={addCampaignForm.subject || ''}
                  onChange={(e) => setAddCampaignForm({ ...addCampaignForm, subject: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500 min-h-[38px]"
                  placeholder="เช่น ขอเรียนเชิญเข้าร่วมโครงการอบรม..."
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">เนื้อหาอีเมล (Message Body) *</label>
                <textarea
                  value={addCampaignForm.message || ''}
                  onChange={(e) => setAddCampaignForm({ ...addCampaignForm, message: e.target.value })}
                  rows={5}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
                  placeholder="กรอกข้อความรายละเอียดเมลที่ส่งออก..."
                ></textarea>
              </div>

              <div className="grid grid-cols-3 gap-4 bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-emerald-800 block">จำนวนผู้รับทั้งหมด *</label>
                  <input
                    type="number"
                    value={addCampaignForm.recipientsCount || 0}
                    onChange={(e) => {
                      const count = Number(e.target.value);
                      const currentSuccess = addCampaignForm.successCount || 0;
                      setAddCampaignForm({ 
                        ...addCampaignForm, 
                        recipientsCount: count,
                        failCount: Math.max(0, count - currentSuccess)
                      });
                    }}
                    className="w-full bg-white border border-slate-250 p-2 rounded-lg text-xs font-bold text-slate-800 min-h-[34px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-emerald-800 block">ส่งสำเร็จ (Success) *</label>
                  <input
                    type="number"
                    value={addCampaignForm.successCount || 0}
                    onChange={(e) => {
                      const success = Number(e.target.value);
                      const currentTotal = addCampaignForm.recipientsCount || 0;
                      setAddCampaignForm({ 
                        ...addCampaignForm, 
                        successCount: success,
                        failCount: Math.max(0, currentTotal - success)
                      });
                    }}
                    className="w-full bg-white border border-slate-250 p-2 rounded-lg text-xs font-bold text-emerald-700 min-h-[34px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-800 block">ส่งล้มเหลว (Fail) *</label>
                  <input
                    type="number"
                    value={addCampaignForm.failCount || 0}
                    onChange={(e) => setAddCampaignForm({ ...addCampaignForm, failCount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-250 p-2 rounded-lg text-xs font-bold text-rose-700 min-h-[34px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">ผู้จัดส่ง / ผู้บันทึกประวัติ *</label>
                  <input
                    type="text"
                    value={addCampaignForm.sentBy || ''}
                    onChange={(e) => setAddCampaignForm({ ...addCampaignForm, sentBy: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-850 font-mono focus:outline-none focus:border-emerald-500 min-h-[38px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 block">วันเวลาที่ส่ง *</label>
                  <input
                    type="datetime-local"
                    value={addCampaignForm.sentAt ? addCampaignForm.sentAt.slice(0, 16) : ''}
                    onChange={(e) => setAddCampaignForm({ ...addCampaignForm, sentAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500 min-h-[38px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowAddCampaignModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition min-h-[38px]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleManualAddCampaignLog}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-sm min-h-[38px]"
              >
                เพิ่มบันทึกประวัติ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl flex-shrink-0 ${confirmDialog.isDestructive ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                {confirmDialog.isDestructive ? <Trash2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-800 text-sm">{confirmDialog.title}</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition min-h-[38px]"
              >
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                  await confirmDialog.onConfirm();
                }}
                className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition min-h-[38px] ${
                  confirmDialog.isDestructive 
                    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800' 
                    : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
