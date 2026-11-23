import QRCode from "qrcode";

export function generateSerialNumber(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  return `VM-${ts}-${rand}`;
}

export async function generateQRCodeDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 280,
    margin: 2,
    color: {
      dark: "#111827",
      light: "#FFFFFF",
    },
  });
}

function parseEventDateTime(eventDate: string, timeStr?: string): Date | null {
  if (!eventDate) return null;
  const normalizedTime = timeStr && /^\d{1,2}:\d{2}/.test(timeStr.trim()) ? timeStr.trim() : "23:59";
  const iso = `${eventDate.trim()}T${normalizedTime.length === 5 ? normalizedTime : normalizedTime.slice(0, 5)}:00`;
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(eventDate);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatEventDate(dateStr: string): string {
  if (!dateStr) return "";
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatEventTime(timeStr: string): string {
  if (!timeStr) return "";
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return timeStr;
  const hours = Number(match[1]);
  const minutes = match[2];
  const period = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${period}`;
}

export function isEventExpired(eventDate: string, endTime?: string): boolean {
  const end = parseEventDateTime(eventDate, endTime || "23:59");
  if (!end) return false;
  return end.getTime() < Date.now();
}

export function getMinutesUntilEvent(eventDate: string, startTime?: string): number {
  const start = parseEventDateTime(eventDate, startTime || "00:00");
  if (!start) return 0;
  return Math.round((start.getTime() - Date.now()) / 60_000);
}

export function getDaysUntilEvent(eventDate: string, startTime?: string): number {
  const mins = getMinutesUntilEvent(eventDate, startTime);
  return Math.ceil(mins / (60 * 24));
}
