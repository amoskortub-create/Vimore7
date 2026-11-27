import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseFollowerCount(value?: string | number | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value || typeof value !== "string") return 0;
  const cleaned = value.trim().replace(/,/g, "").toUpperCase();
  const match = cleaned.match(/^([\d.]+)\s*([KMB])?$/);
  if (!match) {
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;
  const suffix = match[2];
  if (suffix === "K") return Math.round(num * 1_000);
  if (suffix === "M") return Math.round(num * 1_000_000);
  if (suffix === "B") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export async function saveFileToDevice(url: string, filename: string): Promise<void> {
  if (typeof window === "undefined" || !url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

export function isTextForeignToUser(text: string, userLanguage = "en"): boolean {
  const trimmed = (text || "").trim();
  if (trimmed.length < 4) return false;

  const lang = (userLanguage || "en").split("-")[0].toLowerCase();
  const hasNonLatinScript = /[\u0600-\u06FF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0900-\u097F]/.test(trimmed);
  if (hasNonLatinScript) return true;

  const hasExtendedLatin = /[àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ¿¡]/i.test(trimmed);
  if (lang === "en") {
    if (hasExtendedLatin) return true;
    const foreignMarkers = /\b(bonjour|merci|salut|comment|pourquoi|avec|vous|nous|je suis|hola|gracias|por favor|buenos|como|porque|obrigado|ola|tudo bem|ciao|grazie|danke|hallo)\b/i;
    return foreignMarkers.test(trimmed);
  }

  // When user prefers a non-English language and the post is predominantly ASCII English
  const asciiRatio = (trimmed.match(/[a-zA-Z0-9\s.,!?'"-]/g)?.length || 0) / trimmed.length;
  return asciiRatio > 0.9 && !hasExtendedLatin;
}

export function dataURLtoFile(dataUrl: string, filename: string): File {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

export function safeJsonParse<T = any>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

export async function safeJson<T = any>(res: Response, fallback: T = {} as T): Promise<T> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

