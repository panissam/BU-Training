import React, { useState } from 'react';
import { Copy, Check, FileCode, CheckCircle, HelpCircle } from 'lucide-react';

export default function AppsScriptGuide() {
  const [copied, setCopied] = useState(false);

  const codeString = `/**
 * =========================================================================
 * 🚀 GOOGLE APPS SCRIPT - ระบบส่งอีเมลยืนยันการอบรมอัตโนมัติ (BU Training Project)
 * =========================================================================
 * 
 * 📌 วิธีการตั้งค่าเพื่อให้ส่งจากอีเมลส่วนกลาง "buqa@bu.ac.th" ทุกครั้ง:
 * -------------------------------------------------------------------------
 * วิธีที่ 1 (แนะนำและง่ายที่สุด): ให้ล็อกอิน script.google.com ด้วยบัญชี "buqa@bu.ac.th"
 *          แล้วกด Deploy เว็บแอป สคริปต์นี้จะส่งอีเมลโดยใช้ชื่อและบัญชี buqa@bu.ac.th อัตโนมัติ!
 * 
 * วิธีที่ 2 (ส่งแทนในฐานะบัญชีอื่น): หากคุณล็อกอินด้วย panisara.l@bu.ac.th 
 *          1. ตรวจสอบให้แน่ใจว่าได้ทำการเพิ่ม buqa@bu.ac.th เข้าเป็น "ส่งอีเมลในนามของ... (Send mail as)"
 *             ในการตั้งค่า Gmail ของคุณเรียบร้อยแล้ว (ตั้งค่า Gmail > บัญชีและการนำเข้า > ส่งอีเมลในฐานะ)
 *          2. สคริปต์นี้ตรวจจับการตั้งค่าและเลือกส่งจาก buqa@bu.ac.th ให้คุณโดยอัติโนมัติ!
 * 
 * 📌 วิธีการดำเนินงาน Deploy มาตรฐาน:
 * 1. ไปที่เว็บ https://script.google.com ล็อกอินด้วยอีเมลของคุณ (หรือ buqa@bu.ac.th)
 * 2. ลบโค้ดเดิมทั้งหมดในไฟล์ "รหัส.gs" แล้ววางโค้ดนี้ลงไปแทนทั้งหมด
 * 3. กดปุ่ม "บันทึกโครงการ" (ไอคอนรูปแผ่นดิสก์ 💾)
 * 4. กดปุ่ม "การทำให้ใช้งานได้" (Deploy) -> เลือก "การทำให้ใช้งานได้ใหม่" (New deployment)
 * 5. เลือกประเภทการทำงานเป็น: "เว็บแอป" (Web app)
 *    - กำหนดค่า "เรียกใช้งานในฐานะ (Execute as)": เลือก "ฉัน (Me)"
 *    - กำหนดค่า "ผู้เข้าถึง (Who has access)": เลือก "ทุกคน (Anyone)" <--- **ต้องเป็นข้อนี้เท่านั้น ผู้อื่นถึงจะได้เมล!**
 * 6. กด "การทำให้ใช้งานได้" (Deploy) 
 * 7. ให้สิทธิ์การเข้าถึง (Authorize Access) -> เลือกบัญชี -> กด "Advanced" -> กด "Go to... (unsafe)" -> แล้วกดยอมรับ (Allow)
 * 8. คัดลอก "URL ของเว็บแอป" ที่ได้ มาวางในเมนู "ตั้งค่าเว็บบริการส่งเมล" ในระบบนี้
 */

// ฟังก์ชันศูนย์กลางในการเรียกส่งอีเมล พร้อมตรวจสอบและสลับผู้ส่งเป็น buqa@bu.ac.th หากได้รับอนุญาต
function sendEmailWithSender(recipient, subject, htmlBody, inlinePosterBase64, inlinePosterContentType, bccRecipients, ccRecipient) {
  var senderName = "สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ";
  var targetAlias = "buqa@bu.ac.th";
  var options = {
    htmlBody: htmlBody,
    name: senderName
  };

  if (bccRecipients) {
    options.bcc = bccRecipients;
  }

  if (ccRecipient) {
    options.cc = ccRecipient;
  }

  // แนบรูปภาพโปสเตอร์อบรมแบบ Inline (CID) เพื่อแก้ไขปัญหารูปภาพ Base64 ไม่แสดงผลในผู้ใช้งาน Gmail / Mail Clients
  if (inlinePosterBase64 && inlinePosterContentType) {
    try {
      var decoded = Utilities.base64Decode(inlinePosterBase64);
      var blob = Utilities.newBlob(decoded, inlinePosterContentType, "course_poster_image");
      options.inlineImages = {
        "course_poster_cid": blob
      };
    } catch (inlineErr) {
      console.warn("⚠️ Cannot attach inline poster: " + inlineErr.toString());
    }
  }

  try {
    // ดึงอีเมลผู้ใช้งานปัจจุบันที่เรียกใช้สคริปต์
    var activeEmail = Session.getActiveUser().getEmail();
    console.log("👉 Deployed user email: " + activeEmail);

    if (activeEmail.toLowerCase() === targetAlias.toLowerCase()) {
      console.log("🟢 Running directly under target account: " + targetAlias);
    } else {
      // ตรวจสอบว่าใน Gmail ของผู้ใช้ปัจจุบัน มีการตั้งค่า "ส่งเมลในนาม" (Send mail as) สำหรับ targetAlias หรือไม่
      var aliases = GmailApp.getAliases();
      var hasAlias = false;
      for (var i = 0; i < aliases.length; i++) {
        if (aliases[i].toLowerCase() === targetAlias.toLowerCase()) {
          hasAlias = true;
          break;
        }
      }

      if (hasAlias) {
        options.from = targetAlias;
        console.log("👉 Found authorized alias! Switched sender to: " + targetAlias);
      } else {
        console.log("⚠️ Alias '" + targetAlias + "' not configured as 'Send mail as' in " + activeEmail + "'s Gmail settings. Sending under default address.");
      }
    }

    GmailApp.sendEmail(recipient, subject, "", options);
    console.log("🟢 GmailApp successfully sent email to: " + recipient + " | BCC: " + (bccRecipients || "none") + " | Sender: " + (options.from || activeEmail));
  } catch (gmailErr) {
    // ในกรณีฉุกเฉิน หากส่งผ่าน GmailApp ขัดข้อง ให้ใช้ MailApp มาตรฐานมาเป็นระบบสำรอง (Fallback)
    console.warn("🟡 GmailApp failed: " + gmailErr.toString() + ". Switched to MailApp fallback.");
    try {
      var mailAppOptions = {
        to: recipient,
        subject: subject,
        htmlBody: htmlBody
      };
      if (bccRecipients) {
        mailAppOptions.bcc = bccRecipients;
      }
      MailApp.sendEmail(mailAppOptions);
      console.log("🟢 MailApp successfully sent email fallback to: " + recipient);
    } catch (mailappErr) {
      // หากส่งเป็นกลุ่มล้มเหลวเนื่องจากมีอีเมลบางรายการไม่ถูกต้อง ให้แยกลูปส่งรายบุคคลอัตโนมัติ เพื่อให้ผู้รับคนอื่นได้รับเมลครบถ้วน
      var addressList = recipient.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
      if (addressList.length > 1) {
        console.warn("🟡 Batch send failed, auto-recovering per-recipient for " + addressList.length + " addresses...");
        for (var k = 0; k < addressList.length; k++) {
          var singleAddr = addressList[k];
          try {
            GmailApp.sendEmail(singleAddr, subject, "", options);
          } catch (e1) {
            try {
              MailApp.sendEmail({ to: singleAddr, subject: subject, htmlBody: htmlBody });
            } catch (e2) {
              console.warn("⚠️ Failed sending to: " + singleAddr);
            }
          }
        }
        return;
      }
      console.error("🔥 All email send methods failed: " + mailappErr.toString());
      throw mailappErr;
    }
  }
}

function doPost(e) {
  // ตั้งค่า CORS Response เพื่อรองรับการส่งข้ามไซต์จาก Browser ทุกอุปกรณ์
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-requested-with',
    'Access-Control-Max-Age': '86400'
  };

  // รองรับกรณีบราวเซอร์ส่ง OPTIONS Request มาร้องขอสิทธิ์ก่อนส่งยิงจริง
  if (e.parameter && e.parameter.method === 'OPTIONS') {
    return ContentService.createTextOutput('')
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeaders(headers);
  }

  try {
    var postContent = "";
    
    // 1. ดึงข้อมูลดิบในรูปแบบ UTF-8 จาก bytes โดยตรงก่อน เพื่อป้องการปัญหาภาษาไทย/อิโมจิเพี้ยนเป็นตัวสี่เหลี่ยม 
    if (e && e.postData && e.postData.bytes) {
      try {
        postContent = Utilities.newBlob(e.postData.bytes).getDataAsString("UTF-8");
      } catch (e1) {
        postContent = "";
      }
    }
    
    // 2. ถ้าหากไม่ได้ผล ให้ดึงจาก contents (Fallback)
    if (!postContent && e && e.postData && e.postData.contents) {
      postContent = e.postData.contents;
    }

    if (!postContent) {
      throw new Error("ไม่พบข้อมูลเนื้อหาในคำขอ (Request body is empty)");
    }

    // 3. หากพบว่าข้อมูลถูกเข้ารหัสแบบ URL-encoded (เช่น เริ่มต้นด้วย %7B หรือไม่มี { ในช่วงต้น) ให้ถอดรหัสก่อน
    if (postContent.trim().charAt(0) !== '{' && postContent.indexOf('%') !== -1) {
      try {
        postContent = decodeURIComponent(postContent);
      } catch (decErr) {
        // ใช้ค่าเดิมหากถอดรหัสไม่สำเร็จ
      }
    }

    var data = JSON.parse(postContent);
    var action = data.action; // 'register', 'checkin', 'bulk', or 'campaign_invitation'
    
    // บันทึก Log เข้าระบบคลาวด์เก็บไว้ตรวจสอบสถานะย้อนหลังได้ที่หน้า "การดำเนินการแก้ไข (Executions)" ใน Apps Script
    console.log("🔥 Request Action: " + action + " | Payload: " + postContent);

    if (action === 'register') {
      var email = data.email ? data.email.trim() : '';
      var name = data.name || '';
      var courseTitle = data.courseTitle || 'หลักสูตรอบรม';
      var date = data.date || '';
      var time = data.time || '';
      var location = data.location || '';
      var description = data.description || "โครงการอบรมพัฒนาศึกษา มหาวิทยาลัยกรุงเทพ";
      
      if (!email) {
        throw new Error("ไม่มีข้อมูลที่อยู่อีเมลผู้รับปลายทาง (Missing email field)");
      }

      // ระบบรองรับหัวข้อและเนื้อหาจดหมายที่ปรับแต่งจากหน้าเว็บโดยตรง (ส่งมาในฟิลด์ subject และ htmlBody)
      var subject = data.subject || "ยืนยันการลงทะเบียนอบรมสำเร็จ";
      var htmlBody = data.htmlBody || \`<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <h2 style='color: #ea580c; margin: 10px 0 0 0; font-weight: 800;'>ยืนยันการลงทะเบียนอบรมสำเร็จ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  
  <p style='font-size: 15px; color: #334155;'>เรียน คุณ <strong>\${name}</strong></p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ระบบได้ดำเนินการสำรองที่นั่งสำหรับเข้าการอบรมของท่านเป็นที่เรียบร้อยแล้ว โดยมีรายละเอียดกิจกรรมดังต่อไปนี้</p>
  
  <div style='background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #ea580c; font-size: 14px;'>\${courseTitle}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>วันที่จัดงาน:</strong></td><td>\${date}</td></tr>
      <tr><td style='padding: 6px 0;'><strong>เวลาจัดอบรม:</strong></td><td>\${time} น.</td></tr>
      <tr><td style='padding: 6px 0;'><strong>สถานที่อบรม:</strong></td><td>\${location}</td></tr>
    </table>
  </div>
  
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
</div>\`;
                  
      // ส่งจดหมายปลายทางโดยอ้างอิงฟังก์ชันกลาง
      var inlinePosterBase64 = data.inlinePosterBase64 || '';
      var inlinePosterContentType = data.inlinePosterContentType || '';
      sendEmailWithSender(email, subject, htmlBody, inlinePosterBase64, inlinePosterContentType);

      // พยายามสร้าง Event และส่งคำเชิญปฏิทิน Google Calendar ไปยังเมลผู้สมัคร
      try {
        var cleanDate = date.split(',')[0].split('•')[0].trim(); 
        var dateParts = cleanDate.split('-');
        var year = 2026, month = 5, day = 15; 
        if (dateParts.length === 3) {
          year = parseInt(dateParts[0], 10);
          month = parseInt(dateParts[1], 10) - 1; 
          day = parseInt(dateParts[2], 10);
        } else {
          var testD = new Date(cleanDate);
          if (!isNaN(testD.getTime())) {
            year = testD.getFullYear();
            month = testD.getMonth();
            day = testD.getDate();
          }
        }

        var startHour = 9, startMin = 0;
        var endHour = 12, endMin = 0;

        var cleanTime = time.replace(/น\./i, '').replace(/น/i, '').trim(); 
        var timeParts = cleanTime.split('-');
        if (timeParts.length >= 1) {
          var startPart = timeParts[0].trim().replace('.', ':');
          var sp = startPart.split(':');
          if (sp.length >= 2) {
            startHour = parseInt(sp[0], 10);
            startMin = parseInt(sp[1], 10);
          }
        }
        if (timeParts.length >= 2) {
          var endPart = timeParts[1].trim().replace('.', ':');
          var ep = endPart.split(':');
          if (ep.length >= 2) {
            endHour = parseInt(ep[0], 10);
            endMin = parseInt(ep[1], 10);
          }
        }

        var startDateObj = new Date(year, month, day, startHour, startMin, 0);
        var endDateObj = new Date(year, month, day, endHour, endMin, 0);

        if (isNaN(startDateObj.getTime())) {
          startDateObj = new Date();
          startDateObj.setHours(9, 0, 0, 0);
          endDateObj = new Date();
          endDateObj.setHours(12, 0, 0, 0);
        }
        
        // สร้างปฏิทินนัดหมายเชิญ
        var calendar = CalendarApp.getDefaultCalendar();
        calendar.createEvent(
          "BU Training: " + courseTitle,
          startDateObj,
          endDateObj,
          {
            description: "สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ\\nผู้เข้าร่วม: " + name + " (" + email + ")\\n" + description,
            location: location,
            guests: email,
            sendInvites: true
          }
        );
        console.log("🟢 Created Google Calendar Event and invited: " + email);
      } catch (calErr) {
        console.error("⚠️ Calendar invite bypass (Normal for non-workspace testing): " + calErr.toString());
      }

      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "register" }))
                           .setMimeType(ContentService.MimeType.JSON)
                           .setHeaders(headers);
    }
    else if (action === 'checkin') {
      var email = data.email ? data.email.trim() : '';
      var name = data.name || '';
      var courseTitle = data.courseTitle || 'หลักสูตรอบรม';
      var date = data.date || '';
      var time = data.time || '';
      var location = data.location || '';
      
      if (!email) {
        throw new Error("ไม่มีข้อมูลที่อยู่อีเมลผู้รับปลายทาง (Missing email field)");
      }

      // ระบบรองรับหัวข้อและเนื้อหาจดหมายที่ปรับแต่งจากหน้าเว็บโดยตรง (ส่งมาในฟิลด์ subject และ htmlBody)
      var subject = data.subject || ("เช็คอินเข้าเรียนสำเร็จเรียบร้อย: " + courseTitle);
      var htmlBody = data.htmlBody || \`<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 600px; margin: auto; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);'>
  <div style='text-align: center; margin-bottom: 20px;'>
    <h2 style='color: #7c3aed; margin: 10px 0 0 0; font-weight: 800;'>สแกนเช็คอินเข้าชั้นเรียนสำเร็จ</h2>
    <p style='color: #64748b; font-size: 13px;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</p>
  </div>
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin-bottom: 20px;' />
  <p style='font-size: 15px; color: #334155;'>สวัสดีคุณ <strong>\${name}</strong>,</p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ระบบได้รับการเช็คอินและสแกนยืนยันการเข้าร่วมงานสัมมนาอบรมของคุณเป็นที่เรียบร้อย ข้อมูลการประเมินเวลามีดังนี้:</p>
  
  <div style='background-color: #f5f3ff; border-left: 4px solid #7c3aed; padding: 15px; border-radius: 8px; margin: 20px 0;'>
    <table style='width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;'>
      <tr><td style='padding: 6px 0; width: 110px;'><strong>อบรม:</strong></td><td><strong style='color: #7c3aed; font-size: 14px;'>\${courseTitle}</strong></td></tr>
      <tr><td style='padding: 6px 0;'><strong>วันที่และเวลา:</strong></td><td>\${date} (\${time} น.)</td></tr>
      <tr><td style='padding: 6px 0;'><strong>สถานที่จัดงาน:</strong></td><td>\${location}</td></tr>
    </table>
  </div>
  
  <p style='font-size: 13px; color: #b91c1c; line-height: 1.6; background-color: #fef2f2; padding: 12px; border-radius: 8px; border: 1px solid #fee2e2; font-weight: bold;'>
    ขั้นตอนถัดไป: โปรดล็อกอินเข้าสู่เว็บไซต์ระบบเพื่อตอบแบบประเมินความพึงพอใจโครงการสัมมนานี้ เพื่อรับสิทธิ์จัดพิมพ์วุฒิบัตรสะสมชั่วโมงและเป็นหลักฐานชั่วโมงงานถัดไปค่ะ
  </p>
  
  <hr style='border: none; border-top: 1px solid #f1f5f9; margin: 25px 0;'/>
  <div style='text-align: center;'>
    <p style='font-size: 11px; color: #94a3b8; margin: 0;'>อีเมลนี้เป็นการแจ้งเตือนแบบอัตโนมัติจากระบบพัฒนาบุคลากร มหาวิทยาลัยกรุงเทพ</p>
  </div>
</div>\`;
                  
      var inlinePosterBase64 = data.inlinePosterBase64 || '';
      var inlinePosterContentType = data.inlinePosterContentType || '';
      sendEmailWithSender(email, subject, htmlBody, inlinePosterBase64, inlinePosterContentType);

      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "checkin" }))
                           .setMimeType(ContentService.MimeType.JSON)
                           .setHeaders(headers);
    } 
    else if (action === 'bulk') {
      var recipientList = data.emails; // รายชื่อเมลทั้งหมด
      var courseTitle = data.courseTitle || 'สัมมนาการศึกษา';
      var messageText = data.messageText || '';
      var ccEmail = data.ccEmail || '';
      
      if (!recipientList || !recipientList.length) {
        throw new Error("ไม่มีรายชื่ออีเมลผู้รับส่ง (Missing recipient list)");
      }

      var subject = "📣 ข่าวสาร/เอกสารส่งต่อสำคัญจากหลักสูตร: " + courseTitle;
      var sentCount = 0;
      var failedCount = 0;
      var failedEmails = [];

      for (var i = 0; i < recipientList.length; i++) {
        var email = recipientList[i] ? recipientList[i].trim() : "";
        if (email) {
          try {
            var htmlBody = \`<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 650px; margin: auto; background-color: #ffffff;'>
  <h2 style='color: #4f46e5; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; font-weight: 800;'>\${courseTitle}</h2>
  <p style='font-size: 14px; color: #334155;'>เรียน อาจารย์ทุกท่าน,</p>
  <p style='font-size: 14px; color: #475569; line-height: 1.6;'>ผู้ดำเนินการจัดโครงการอบรมหลักสูตรดังกล่าว ได้ทำการส่งข้อมูลเอกสารประกอบการศึกษาและไฟล์มีเดียประกอบสัมมนาสำหรับคุณ ดังรายละเอียดความข้างล่างนี้:</p>
  <div style='background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #334155; border: 1px solid #f1f5f9; white-space: pre-wrap; line-height: 1.6;'>\${messageText}</div>
  <p style='font-size: 14px; color: #334155;'>ขอแสดงความนับถืออย่างสูง,<br/><strong style='color: #4f46e5;'>สำนักมาตรฐานคุณภาพการศึกษา มหาวิทยาลัยกรุงเทพ</strong></p>
</div>\`;
                     
            sendEmailWithSender(email, subject, htmlBody, undefined, undefined, undefined, ccEmail || undefined);
            sentCount++;
          } catch (itemErr) {
            failedCount++;
            failedEmails.push(email);
            console.warn("⚠️ Failed sending bulk item to " + email + ": " + itemErr.toString());
          }
        }
      }
      
      var bulkStatus = sentCount > 0 ? "success" : "error";
      var bulkMessage = failedCount > 0 
        ? ("ส่งสำเร็จ " + sentCount + " คน, ล้มเหลว " + failedCount + " คน") 
        : ("ส่งสำเร็จครบถ้วน " + sentCount + " คน");

      return ContentService.createTextOutput(JSON.stringify({ 
        status: bulkStatus, 
        count: sentCount, 
        failedCount: failedCount, 
        failedEmails: failedEmails,
        message: bulkMessage 
      }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(headers);
    }
    else if (action === 'campaign_invitation') {
      var email = data.email ? data.email.trim() : '';
      var subject = data.subject || 'เชิญเข้าร่วมกิจกรรม';
      var messageText = data.messageText || '';
      var bccEmails = data.bccEmails || null;
      var bccString = "";
      
      if (bccEmails && bccEmails.length > 0) {
        var cleanedBcc = [];
        for (var i = 0; i < bccEmails.length; i++) {
          if (bccEmails[i]) cleanedBcc.push(bccEmails[i].trim());
        }
        bccString = cleanedBcc.join(", ");
      }
      
      if (!email && !bccString) {
        throw new Error("ไม่มีข้อมูลที่อยู่อีเมลผู้รับปลายทาง (Missing email/BCC field)");
      }

      var htmlBody = data.htmlBody || \`<div style='font-family: "Sarabun", sans-serif, Tahoma; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 650px; margin: auto; background-color: #ffffff;'>
  \${messageText.replace(/\\n/g, '<br/>')}
</div>\`;
                     
      var inlinePosterBase64 = data.inlinePosterBase64 || '';
      var inlinePosterContentType = data.inlinePosterContentType || '';
      
      var ccEmail = data.ccEmail || '';
      // หากส่งเป็นรายการอีเมลหลายคน ให้ trim และตัดช่องว่างให้สะอาด
      var mainRecipient = email || Session.getActiveUser().getEmail();
      if (mainRecipient.indexOf(',') > -1) {
        var parts = mainRecipient.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        mainRecipient = parts.join(", ");
      }
      sendEmailWithSender(mainRecipient, subject, htmlBody, inlinePosterBase64, inlinePosterContentType, bccString || undefined, ccEmail || undefined);

      return ContentService.createTextOutput(JSON.stringify({ status: "success", type: "campaign_invitation", count: bccEmails ? bccEmails.length : 1 }))
                           .setMimeType(ContentService.MimeType.JSON)
                           .setHeaders(headers);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" }))
                         .setMimeType(ContentService.MimeType.JSON)
                         .setHeaders(headers);
  } catch (err) {
    console.error("🔥 Error caught in doPost: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON)
                         .setHeaders(headers);
  }
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 md:p-6 text-slate-800">
      <div className="flex items-center gap-2 mb-3">
        <FileCode className="h-6 w-6 text-violet-600" id="gas-guide-icon" />
        <h3 className="text-lg font-bold text-slate-900" id="gas-guide-title">
          คู่มือจัดตั้งระบบส่งอีเมลฟรี (Google Apps Script)
        </h3>
      </div>
      <p className="text-sm text-slate-600 mb-4" id="gas-guide-desc">
        ระบบใช้สถาปัตยกรรม Serverless เชื่อมต่อไปยัง Google Apps Script ของคุณ 
        เพื่อให้บริการส่งอีเมลตอบรับและส่งประกาศกลุ่มอย่างเป็นส่วนตัวและฟรี 100% ภายใต้โควต้าของมหาวิทยาลัย (@bu.ac.th)
      </p>

      <div className="space-y-4 mb-5 text-sm" id="gas-steps">
        <div className="flex gap-2">
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-700 font-semibold text-xs">
            1
          </div>
          <div>
            <p className="font-semibold text-slate-900">สร้างโครงการสคริปต์ใหม่</p>
            <p className="text-slate-500">ไปที่ <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-violet-600 underline font-medium">script.google.com</a> กดปุ่ม "โครงการใหม่" (New Project)</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-700 font-semibold text-xs">
            2
          </div>
          <div>
            <p className="font-semibold text-slate-900">วางสคริปต์และบันทึก</p>
            <p className="text-slate-500">คัดลอกซอร์สโค้ดด้านล่างนี้ วางแทนที่โค้ดเดิมในไฟล์ <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono text-xs">รหัส.gs</code> แล้วกดบันทึก</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-700 font-semibold text-xs">
            3
          </div>
          <div>
            <p className="font-semibold text-slate-900">การติดตั้งใช้งานในลักษณะเว็บแอป (Deploy)</p>
            <p className="text-slate-500">
              กดปุ่ม <strong className="text-slate-800">การทำให้ใช้งานได้ (Deploy)</strong> &gt; <strong className="text-slate-800">การทำให้ใช้งานได้ใหม่ (New deployment)</strong> จากนั้นกำหนดค่า:<br />
              - ประเภทบริการ: <strong className="text-violet-700">เว็บแอป (Web app)</strong><br />
              - เรียกใช้งานในฐานะ: <strong className="text-violet-700">ฉัน (บัญชีของคุณ/ panisara.l@bu.ac.th หรือดีที่สุดล็อกอินด้วย buqa@bu.ac.th)</strong><br />
              - ผู้เข้าถึง: <strong className="text-violet-700">ทุกคน (Anyone)</strong>
            </p>
            <div className="mt-2 bg-violet-50 border border-violet-100 p-2.5 rounded-lg text-violet-800 text-[11px] leading-relaxed">
              <span className="font-bold">📧 วิธีส่งอีเมลจาก "buqa@bu.ac.th" ทุกครั้ง:</span><br />
              • <strong className="underline">วิธีที่ 1 (ง่ายที่สุด):</strong> ล็อกอินเข้าระบบ Google Apps Script ด้วยบัญชี <strong className="text-violet-900">buqa@bu.ac.th</strong> โดยตรงและทำการบันทึก+Deploy ด้วยสคริปต์นี้<br />
              • <strong className="underline">วิธีที่ 2 (ส่งแทน):</strong> หากยังต้องการล็อกอินผ่านบัญชีของตนเอง ให้เพิ่มอีเมล <strong className="font-semibold text-violet-900">buqa@bu.ac.th</strong> เข้าเป็นอีเมลสำรองในส่วน <strong className="text-violet-950">"ส่งอีเมลในนามของ... (Send mail as)"</strong> ของผู้รับสิทธิ์ส่งก่อน จากนั้นระบบจะสลับบัญชีผู้ส่งไปยัง buqa@bu.ac.th ให้ปลายทางโดยอัตโนมัติ!
            </div>
            <div className="mt-2 bg-rose-50 border border-rose-100 p-2.5 rounded-lg text-rose-800 text-[11px] leading-relaxed">
              <span className="font-bold">⚠️ ข้อควรระวังสูงสุด (สาเหตุหลักที่ผู้อื่นไม่ได้รับเมล):</span> ต้องกำหนดให้ผู้เข้าถึงเป็น <strong className="underline">ทุกคน (Anyone)</strong> เสมอ! 
              หากคุณเลือก "เฉพาะฉัน (Only myself)" จะมีเพียงตัวคุณคนเดียวเท่านั้นที่ได้รับเมลเวลากดทดสอบ แต่เมื่อคุณครูหรือบุคลากรคนอื่น ๆ เข้ามาลงทะเบียนจริง บราวเซอร์ของพวกเขาจะไม่สามารถเข้าถึงลิงก์นี้ได้ และระบบจะไม่ส่งอีเมลแต่อย่างใด
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 text-violet-700 font-semibold text-xs">
            4
          </div>
          <div>
            <p className="font-semibold text-slate-900">ก๊อปปี้ URL มากรอกในตั้งค่าเว็บนี้</p>
            <p className="text-slate-500">คัดลอก "URL เว็บแอป" ที่ได้จากการ Deploy แล้วคลิกที่ <strong className="text-slate-800">"ตั้งค่าเว็บบริการส่งเมล"</strong> ด้านล่างเพื่อบันทึกระบบ</p>
          </div>
        </div>
      </div>

      {/* Code box */}
      <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-900 text-slate-100 font-mono text-xs max-h-60 overflow-y-auto mb-4" id="gas-code-box">
        <div className="sticky top-0 right-0 p-2 flex justify-end bg-slate-800/80 backdrop-blur border-b border-slate-700">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs transition duration-150"
            id="btn-copy-gas-code"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">คัดลอกแล้ว!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>คัดลอกโค้ด</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-4 leading-relaxed overflow-x-auto text-slate-300">
          <code>{codeString}</code>
        </pre>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs flex gap-2">
        <HelpCircle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <strong>โหมดทดสอบจำลอง (Simulation Mode)</strong>: หากท่านยังไม่ได้นำไปติดตั้ง 
          ระบบจะทำการจำลองการส่งข้อมูล (Simulation Mode) และแจ้งประวัติการส่งเมลออกมาทางคอนโซล/แจ้งเตือนบนเว็บโดยอัตโนมัติ เพื่อให้ท่านทดลองระบบได้ทันที
        </div>
      </div>
    </div>
  );
}
