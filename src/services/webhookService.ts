/**
 * Utility service to execute POST requests to Google Apps Script Webhook endpoint
 * and accurately validate JSON response status and handle delivery failures.
 */

export interface GasWebhookResponse {
  status: 'success' | 'error' | 'partial' | string;
  message?: string;
  count?: number;
  failedCount?: number;
  failedEmails?: string[];
  type?: string;
  [key: string]: any;
}

export interface PostGasWebhookOptions {
  timeoutMs?: number;
}

/**
 * Sends a payload to the Google Apps Script Webhook endpoint, parses the JSON response,
 * and verifies that responseData.status === 'success'.
 *
 * Throws an explicit Error with detailed message if:
 * - HTTP request fails or status is not ok (4xx, 5xx)
 * - Response cannot be parsed as JSON or is an HTML error page
 * - responseData.status === 'error'
 * - responseData.status is missing or unexpected
 * - responseData indicates quota exceeded or delivery failure
 */
export async function sendGasWebhook(
  gasUrl: string,
  payload: Record<string, any>,
  options: PostGasWebhookOptions = {}
): Promise<GasWebhookResponse> {
  const cleanUrl = gasUrl ? gasUrl.trim() : '';
  if (!cleanUrl) {
    throw new Error('ไม่พบ URL ของ Google Apps Script Webhook (GAS Webhook URL is empty)');
  }

  const { timeoutMs = 30000 } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    // Send as text/plain to avoid preflight CORS issues while allowing standard redirect following
    response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (netErr: any) {
    clearTimeout(timeoutId);
    if (netErr?.name === 'AbortError') {
      throw new Error(`การเชื่อมต่อ Google Apps Script หมดเวลา (${Math.round(timeoutMs / 1000)} วินาที) กรุณาลองใหม่อีกครั้ง`);
    }
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    // Provide actionable Thai explanation for common network / CORS issues
    throw new Error(`ไม่สามารถเชื่อมต่อไปยัง Google Apps Script ได้: ${msg} (โปรดตรวจสอบว่าได้ Deploy เป็น Web App และตั้งค่า Who has access: Anyone แล้วหรือไม่)`);
  } finally {
    clearTimeout(timeoutId);
  }

  // 1. Check HTTP level status
  if (!response.ok && response.status !== 0) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      // Ignore
    }
    throw new Error(`Google Apps Script ส่งกลับรหัสข้อผิดพลาด HTTP ${response.status}: ${errBody || response.statusText}`);
  }

  // 2. Read and parse body as JSON
  let rawText = '';
  try {
    rawText = await response.text();
  } catch (textErr: any) {
    throw new Error(`ไม่สามารถอ่านเนื้อหาการตอบกลับจาก Google Apps Script ได้: ${textErr?.message || textErr}`);
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('Google Apps Script ตอบกลับด้วยข้อมูลว่างเปล่า (Empty response from server)');
  }

  let responseData: GasWebhookResponse;
  try {
    responseData = JSON.parse(rawText);
  } catch (jsonErr) {
    // Detect typical Google server-side error HTML (quota exceeded / authorization error)
    if (rawText.includes('Service invoked too many times') || rawText.toLowerCase().includes('quota')) {
      throw new Error('โควต้าการส่งอีเมลของ Google Apps Script เต็มแล้วสำหรับวันนี้ (Email quota exceeded for this account)');
    }
    if (rawText.includes('Script function not found') || rawText.includes('Authorization is required')) {
      throw new Error('Google Apps Script ยังไม่ได้รับสิทธิ์อนุญาต (Authorization required) หรือฟังก์ชัน doPost ขัดข้อง กรุณาตั้งค่า Web App สิทธิ์ Anyone');
    }
    const snippet = rawText.length > 200 ? rawText.substring(0, 200) + '...' : rawText;
    throw new Error(`การตอบกลับจาก Google Apps Script ไม่ใช่ JSON ที่ถูกต้อง: ${snippet}`);
  }

  // 3. Check parsed JSON status specifically (strictly require status === 'success')
  if (!responseData || typeof responseData !== 'object') {
    throw new Error('การตอบกลับจาก Google Apps Script มีรูปแบบไม่ถูกต้อง (Invalid response object)');
  }

  // If status is explicit 'error'
  if (responseData.status === 'error') {
    const errorMsg = responseData.message || responseData.error || 'ตรวจพบข้อผิดพลาดจาก Google Apps Script';
    if (typeof errorMsg === 'string' && (errorMsg.includes('Service invoked too many times') || errorMsg.toLowerCase().includes('quota'))) {
      throw new Error(`โควต้าส่งอีเมลของบัญชี Google เต็มแล้ว (Email quota exceeded): ${errorMsg}`);
    }
    throw new Error(`Google Apps Script แจ้งเตือนข้อผิดพลาด: ${errorMsg}`);
  }

  // If status is missing or unexpected (must strictly be 'success')
  if (responseData.status !== 'success') {
    throw new Error(`Google Apps Script ส่งสถานะไม่ถูกต้อง (${responseData.status || 'ไม่พบฟิลด์ status'}): ${responseData.message || JSON.stringify(responseData)}`);
  }

  // If bulk action and all failed on server side
  if (payload.action === 'bulk' && responseData.failedCount && responseData.failedCount > 0 && !responseData.count) {
    throw new Error(`การจัดส่งอีเมลแบบกลุ่มล้มเหลวทั้งหมด (${responseData.failedCount} คน): ${responseData.message || 'โปรดตรวจสอบโควต้าอีเมล'}`);
  }

  return responseData;
}

/**
 * Formats a user-friendly summary of bulk email dispatch results.
 */
export function formatBulkSummary(
  response: GasWebhookResponse,
  fallbackTotal: number = 0
): {
  successCount: number;
  failedCount: number;
  message: string;
  hasFailures: boolean;
} {
  const failedCount = typeof response.failedCount === 'number' ? response.failedCount : 0;
  const successCount = typeof response.count === 'number'
    ? response.count
    : Math.max(0, fallbackTotal - failedCount);
  const hasFailures = failedCount > 0;

  let message = '';
  if (hasFailures && successCount > 0) {
    message = `ส่งสำเร็จ ${successCount} รายการ, ล้มเหลว ${failedCount} รายการ`;
  } else if (hasFailures && successCount === 0) {
    message = `ส่งล้มเหลวทั้งหมด ${failedCount} รายการ`;
  } else {
    message = `ส่งสำเร็จครบถ้วน ${successCount} รายการ`;
  }

  return {
    successCount,
    failedCount,
    message,
    hasFailures
  };
}

