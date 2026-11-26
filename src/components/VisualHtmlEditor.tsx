import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code2,
  Eye,
  Italic,
  RotateCcw,
  Sparkles,
  Underline,
} from 'lucide-react';

export interface VariableOption {
  token: string;
  label: string;
}

export const DEFAULT_EMAIL_VARIABLES: VariableOption[] = [
  { token: '{learner_name}', label: 'ชื่อผู้รับ' },
  { token: '{course_title}', label: 'ชื่อหลักสูตร' },
  { token: '{course_date}', label: 'วันที่จัดอบรม' },
  { token: '{course_time}', label: 'เวลาจัดอบรม' },
  { token: '{location}', label: 'สถานที่จัดอบรม' },
];

const DANGEROUS_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'LINK',
  'META',
  'BASE',
  'SVG',
  'MATH',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
]);

const isSafeEmailUrl = (rawVal: string): boolean => {
  const val = rawVal.trim();
  if (!val) return true;
  // Allow dynamic template placeholders like {register_link}, {survey_link}, {course_poster_url}
  if (/^\{[a-zA-Z0-9_]+\}$/.test(val)) return true;
  if (val.startsWith('cid:')) return true;
  if (val.startsWith('#') || (val.startsWith('/') && !val.startsWith('//'))) return true;
  if (/^https?:\/\//i.test(val) || /^mailto:/i.test(val) || /^tel:/i.test(val)) return true;
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-zA-Z0-9+/=\s]+$/i.test(val)) return true;
  return false;
};

const sanitizeInlineStyle = (styleValue: string): string => {
  if (!styleValue) return '';
  if (/expression\s*\(|javascript:|vbscript:|-moz-binding|@import|behavior\s*:/i.test(styleValue)) {
    return '';
  }
  // Strip unsafe url(...) declarations inside style
  return styleValue.replace(/url\s*\(([^)]*)\)/gi, (_match, inner) => {
    const cleaned = String(inner || '').trim().replace(/^['"]|['"]$/g, '');
    return isSafeEmailUrl(cleaned) ? `url('${cleaned}')` : '';
  });
};

/**
 * Safely sanitizes email/rich-text HTML using the browser's DOMParser while preserving
 * email-compatible inline styles, layout tables, links, and template placeholders.
 */
export const sanitizeEmailHtml = (rawHtml: string): string => {
  if (!rawHtml) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rawHtml
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '');
  }

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  const sanitizeNodeTree = (parent: Node) => {
    const children = Array.from(parent.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (DANGEROUS_TAGS.has(el.tagName.toUpperCase())) {
          el.remove();
          continue;
        }

        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (
            name.startsWith('on') ||
            name === 'srcdoc' ||
            name === 'formaction' ||
            name === 'xlink:href' ||
            name === 'xmlns'
          ) {
            el.removeAttribute(attr.name);
            continue;
          }

          if (name === 'href' || name === 'src') {
            if (!isSafeEmailUrl(attr.value)) {
              el.removeAttribute(attr.name);
            }
            continue;
          }

          if (name === 'style') {
            const safeStyle = sanitizeInlineStyle(attr.value);
            if (safeStyle) {
              el.setAttribute('style', safeStyle);
            } else {
              el.removeAttribute('style');
            }
          }
        }

        sanitizeNodeTree(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
      }
    }
  };

  sanitizeNodeTree(doc.body);
  return doc.body.innerHTML;
};

const hasBlockOrBreakHtml = (val: string): boolean => {
  return /<(div|p|table|tr|td|th|ul|ol|li|h[1-6]|hr|blockquote|br)\b/i.test(val);
};

export const toVisualEditableHtml = (raw: string): string => {
  if (!raw) return '';
  const withNobr = raw.replace(
    /\[nobr\]([\s\S]*?)\[\/nobr\]/g,
    '<span style="white-space: nowrap; word-break: keep-all; display: inline-block;">$1</span>'
  );
  const prepared = hasBlockOrBreakHtml(withNobr)
    ? withNobr
    : withNobr.replace(/\r\n/g, '\n').replace(/\n/g, '<br/>');
  return sanitizeEmailHtml(prepared);
};

const isHtmlVisuallyEmpty = (html: string): boolean => {
  if (!html || !html.trim()) return true;
  if (/<img\b|<hr\b|<table\b/i.test(html)) return false;
  const stripped = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return stripped.length === 0;
};

interface VisualHtmlEditorProps {
  value: string;
  onChange: (htmlString: string) => void;
  placeholder?: string;
  variables?: VariableOption[];
  defaultValue?: string;
  onReset?: () => void;
  resetLabel?: string;
  minHeightClass?: string;
  maxHeightClass?: string;
  id?: string;
}

export default function VisualHtmlEditor({
  value,
  onChange,
  placeholder = 'พิมพ์ข้อความที่นี่ หรือแทรกตัวแปรอัตโนมัติ...',
  variables = DEFAULT_EMAIL_VARIABLES,
  defaultValue,
  onReset,
  resetLabel = 'คืนค่าข้อความเริ่มต้น (Reset Default)',
  minHeightClass = 'min-h-[200px]',
  maxHeightClass = 'max-h-[380px]',
  id,
}: VisualHtmlEditorProps) {
  const [mode, setMode] = useState<'visual' | 'source'>('visual');
  const [showVarMenu, setShowVarMenu] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastEmittedValueRef = useRef<string | null>(null);

  // Sync incoming value into contentEditable when changed externally or on switch to Visual mode
  useEffect(() => {
    if (mode !== 'visual') return;
    const el = editorRef.current;
    if (!el) return;

    if (lastEmittedValueRef.current === value) {
      return;
    }

    const nextHtml = toVisualEditableHtml(value);
    if (el.innerHTML !== nextHtml) {
      el.innerHTML = nextHtml;
    }
    lastEmittedValueRef.current = value;
  }, [value, mode]);

  // Close variable dropdown when clicking outside
  useEffect(() => {
    if (!showVarMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setShowVarMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showVarMenu]);

  const saveSelection = () => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const emitFromEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    const sanitized = sanitizeEmailHtml(el.innerHTML);
    const normalized = isHtmlVisuallyEmpty(sanitized) ? '' : sanitized;
    lastEmittedValueRef.current = normalized;
    onChange(normalized);
  };

  const applyFormat = (command: string, commandValue?: string) => {
    if (mode !== 'visual') return;
    restoreSelection();
    try {
      document.execCommand('styleWithCSS', false, 'true');
    } catch {
      // Ignore browsers that do not support styleWithCSS
    }
    document.execCommand(command, false, commandValue);
    saveSelection();
    emitFromEditor();
  };

  const handleInsertVariable = (token: string) => {
    setShowVarMenu(false);
    if (mode === 'source') {
      const ta = sourceTextareaRef.current;
      if (ta) {
        const start = ta.selectionStart ?? value.length;
        const end = ta.selectionEnd ?? value.length;
        const nextVal = value.slice(0, start) + token + value.slice(end);
        onChange(nextVal);
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + token.length;
          ta.setSelectionRange(pos, pos);
        });
      } else {
        onChange((value || '') + token);
      }
      return;
    }

    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(token);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
      savedRangeRef.current = range.cloneRange();
    } else if (editorRef.current) {
      editorRef.current.appendChild(document.createTextNode(token));
    }
    emitFromEditor();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const htmlData = e.clipboardData.getData('text/html');
    const textData = e.clipboardData.getData('text/plain');

    if (htmlData) {
      const cleanHtml = sanitizeEmailHtml(htmlData);
      document.execCommand('insertHTML', false, cleanHtml);
    } else if (textData) {
      const escaped = textData
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, '<br/>');
      document.execCommand('insertHTML', false, escaped);
    }
    saveSelection();
    emitFromEditor();
  };

  const handleSwitchMode = (nextMode: 'visual' | 'source') => {
    if (nextMode === mode) return;
    if (nextMode === 'visual') {
      const clean = sanitizeEmailHtml(value);
      if (clean !== value) {
        onChange(clean);
      }
      lastEmittedValueRef.current = null;
      setMode('visual');
    } else {
      const clean = sanitizeEmailHtml(value);
      if (clean !== value) {
        onChange(clean);
      }
      setMode('source');
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
      lastEmittedValueRef.current = null;
      return;
    }
    if (defaultValue !== undefined) {
      lastEmittedValueRef.current = null;
      onChange(defaultValue);
    }
  };

  const isEmpty = isHtmlVisuallyEmpty(value);

  return (
    <div
      id={id}
      className="border border-[#E2E8F0] focus-within:border-[#071A4B] rounded-2xl bg-white shadow-xs transition-colors flex flex-col"
    >
      {/* Compact Formatting & Variable Toolbar */}
      <div className="bg-[#F5F7FA] border-b border-[#E2E8F0] px-2.5 py-2 rounded-t-2xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {/* Formatting Buttons (Active in Visual Mode) */}
          <div className={`flex items-center gap-0.5 bg-white border border-[#E2E8F0] rounded-xl p-0.5 ${mode === 'source' ? 'opacity-45 pointer-events-none' : ''}`}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('bold');
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="ตัวหนา (Bold)"
              aria-label="ตัวหนา"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('italic');
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="ตัวเอียง (Italic)"
              aria-label="ตัวเอียง"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('underline');
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="ขีดเส้นใต้ (Underline)"
              aria-label="ขีดเส้นใต้"
            >
              <Underline className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Text Color Swatches */}
          <div className={`flex items-center gap-0.5 bg-white border border-[#E2E8F0] rounded-xl p-0.5 ${mode === 'source' ? 'opacity-45 pointer-events-none' : ''}`}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('foreColor', '#071A4B');
              }}
              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-extrabold text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="สีน้ำเงินกรมท่า (Navy #071A4B)"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#071A4B] border border-black/10" />
              <span>A</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('foreColor', '#F97316');
              }}
              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-extrabold text-[#F97316] hover:bg-orange-50 transition cursor-pointer"
              title="สีส้ม (Orange #F97316)"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#F97316] border border-black/10" />
              <span>A</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('foreColor', '#334155');
              }}
              className="h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-extrabold text-[#334155] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="สีเทาเข้ม (Dark Gray #334155)"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#334155] border border-black/10" />
              <span>A</span>
            </button>
          </div>

          {/* Alignment Controls */}
          <div className={`flex items-center gap-0.5 bg-white border border-[#E2E8F0] rounded-xl p-0.5 ${mode === 'source' ? 'opacity-45 pointer-events-none' : ''}`}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('justifyLeft');
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="จัดชิดซ้าย"
              aria-label="จัดชิดซ้าย"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('justifyCenter');
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="จัดกึ่งกลาง"
              aria-label="จัดกึ่งกลาง"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyFormat('justifyRight');
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#071A4B] hover:bg-[#F5F7FA] transition cursor-pointer"
              title="จัดชิดขวา"
              aria-label="จัดชิดขวา"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Quick Variable Dropdown */}
          <div className="relative" ref={dropdownContainerRef}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => setShowVarMenu((prev) => !prev)}
              className="h-8 px-3 rounded-full bg-[#F97316] hover:bg-[#EA580C] text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="แทรกตัวแปรอัตโนมัติลงในตำแหน่งเคอร์เซอร์"
            >
              <Sparkles className="h-3 w-3" />
              <span>แทรกตัวแปร</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {showVarMenu && (
              <div className="absolute left-0 mt-1.5 w-64 bg-white border border-[#E2E8F0] rounded-2xl shadow-xl z-40 py-1.5 max-h-64 overflow-y-auto">
                <div className="px-3 py-1.5 border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  คลิกเพื่อแทรกตัวแปรอัตโนมัติ
                </div>
                {variables.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInsertVariable(v.token)}
                    className="w-full text-left px-3 py-2 hover:bg-orange-50/70 flex items-center justify-between gap-2 text-xs transition cursor-pointer"
                  >
                    <span className="font-semibold text-[#071A4B] truncate">{v.label}</span>
                    <code className="text-[10px] font-mono font-bold text-[#EA580C] bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200 shrink-0">
                      {v.token}
                    </code>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mode Switcher & Reset */}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {(defaultValue !== undefined || onReset) && (
            <button
              type="button"
              onClick={handleReset}
              className="h-8 px-2.5 rounded-full bg-white border border-[#E2E8F0] hover:border-[#071A4B] text-[#071A4B] text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
              title={resetLabel}
            >
              <RotateCcw className="h-3 w-3 text-[#F97316]" />
              <span>คืนค่าข้อความเริ่มต้น</span>
            </button>
          )}

          <div className="inline-flex bg-white border border-[#E2E8F0] p-0.5 rounded-full text-[10px]">
            <button
              type="button"
              onClick={() => handleSwitchMode('visual')}
              className={`px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition cursor-pointer ${
                mode === 'visual'
                  ? 'bg-[#071A4B] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#071A4B]'
              }`}
            >
              <Eye className="h-3 w-3" />
              <span>มุมมองข้อความ (Visual)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('source')}
              className={`px-2.5 py-1 rounded-full font-bold flex items-center gap-1 transition cursor-pointer ${
                mode === 'source'
                  ? 'bg-[#F97316] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#071A4B]'
              }`}
            >
              <Code2 className="h-3 w-3" />
              <span>โค้ด HTML (Source)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor Surface */}
      {mode === 'visual' ? (
        <div className="relative rounded-b-2xl bg-white">
          {isEmpty && (
            <div className="pointer-events-none absolute inset-x-4 top-3.5 text-xs text-slate-400 font-sans select-none">
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              saveSelection();
              emitFromEditor();
            }}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onBlur={() => {
              saveSelection();
              emitFromEditor();
            }}
            onPaste={handlePaste}
            className={`w-full ${minHeightClass} ${maxHeightClass} overflow-y-auto overflow-x-hidden p-4 text-sm text-[#071A4B] font-sans leading-relaxed focus:outline-none rounded-b-2xl [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-xl [&_table]:w-full [&_a]:text-[#F97316] [&_a]:underline`}
          />
        </div>
      ) : (
        <textarea
          ref={sourceTextareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const clean = sanitizeEmailHtml(value);
            if (clean !== value) {
              onChange(clean);
            }
          }}
          placeholder={placeholder}
          className={`w-full ${minHeightClass} ${maxHeightClass} bg-[#F5F7FA] p-3.5 rounded-b-2xl text-xs text-[#071A4B] font-mono leading-relaxed focus:outline-none resize-y`}
        />
      )}
    </div>
  );
}
