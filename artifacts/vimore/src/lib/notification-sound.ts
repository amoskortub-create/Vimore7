export interface QuietHoursConfig {
  isSilenceActive?: boolean;
  silenceStart?: string;
  silenceEnd?: string;
}

export function isWithinQuietHours(settings?: QuietHoursConfig | null): boolean {
  if (!settings?.isSilenceActive) return false;
  const start = settings.silenceStart || '22:00';
  const end = settings.silenceEnd || '07:00';
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  if (start === end) return false;
  return start < end
    ? currentTime >= start && currentTime <= end
    : currentTime >= start || currentTime <= end;
}

let fallbackAudio: HTMLAudioElement | null = null;

export function playNotificationSound(soundSet: 'cyberpunk' | 'lofi' = 'cyberpunk') {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (soundSet === 'lofi') {
        // Warm mellow lo-fi chord pulse
        [392, 493.88].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.06);
          gain.gain.setValueAtTime(0.001, now + idx * 0.06);
          gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.06 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.36);
        });
      } else {
        // Crisp futuristic cyberpunk dual-tone chime
        [
          { freq: 880, delay: 0, dur: 0.11 },
          { freq: 1318.5, delay: 0.09, dur: 0.18 },
        ].forEach(({ freq, delay, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + delay);
          gain.gain.setValueAtTime(0.001, now + delay);
          gain.gain.linearRampToValueAtTime(0.09, now + delay + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + dur + 0.02);
        });
      }
      window.setTimeout(() => ctx.close().catch(() => {}), 700);
      return;
    }

    if (!fallbackAudio) fallbackAudio = new Audio('/sounds/notification.mp3');
    fallbackAudio.currentTime = 0;
    fallbackAudio.play().catch(() => {});
  } catch {}
}
