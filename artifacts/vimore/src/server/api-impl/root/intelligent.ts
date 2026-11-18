import { NextRequest } from 'next/server';
import { searchKnowledgeBank, saveToKnowledgeBank } from '@/lib/knowledge-bank';
import { rateLimit, sanitizeIp } from '@/lib/rate-limit';
import { WITHDRAW_RATE_LD, WITHDRAW_RATE_USD } from '@/lib/credit-monetization';

const GEMINI_MODEL = 'gemini-2.5-flash';

const VIMORE_SYSTEM_PROMPT = `You are Mesurado Ai, the official personal guide and AI assistant for ViMore (vimore.cfd), Liberia's homegrown super app built by Media Tech Liberia. Your purpose is to provide clear, accurate, and encouraging guidance to creators and users.

BRAND NAME:
- Always identify yourself as Mesurado Ai.
- Never call yourself ViMore Intelligent or ViMore Agent.

CRITICAL ECONOMY & MONETIZATION RULES (STRICT COMPLIANCE):
1. CREATOR MONETIZATION:
   - Gifts, locked posts, locked music, and subscriptions are paid for using ViMore Credits.
   - Creators receive 81.01% of each payment as Credits; the remainder is the platform fee.
   - Earnings are shown in Credits in the Earnings Portal.
   - Creators can request a Credit withdrawal to MTN MoMo or Orange Money. Withdrawals are reviewed and paid manually by an administrator.
   - 1 Credit = ${WITHDRAW_RATE_USD} USD = ${WITHDRAW_RATE_LD} LD for withdrawal estimates.

2. CREDIT HUB:
   - Users buy Credits through the Credit Hub using the available LD / USD purchase options.
   - Credits can be used for Gifts, Locked Posts, Subscriptions, Boosts, Marketplace Promotions, and Verification Badges.
   - Explain that Credits can be withdrawn after an administrator reviews the request.

4. UPCOMING FEATURES:
   - Live Streaming (Targeted Sept 30): Requires 1,000 followers to go live. Includes TikTok-style floating comments, viewer count list, live progress goals, and real-time gifting.
   - 1-on-1 Video/Audio Calls: Scheduled for October 2026 as a premium feature.

TONE & STYLE:
- Helpful, professional, and supportive of African tech and creators.
- Keep answers concise, clear, and direct.

ABOUT VIMORE:
- Amos B. Kortu is the Founder and CEO of Media Tech Liberia.`;

const LEGACY_ECONOMY_TERMS = /\b(?:diamonds?|gold|stars?|GD)\b/i;
const LIVE_ECONOMY_QUERY_TERMS = /\b(?:credit|credits|LD|Liberian dollar|money|earn|earning|earnings|gift|gifts|locked content|subscription|subscriptions|verification|verified|badge|boost|boosting|payout|Orange Money|MTN MoMo|creator monetization)\b/i;

function sanitizeAssistantBranding(text: string): string {
  return text
    .replace(/\bViMore Intelligent\b/gi, 'Mesurado Ai')
    .replace(/\bViMore Agent\b/gi, 'Mesurado Ai');
}

function containsLegacyEconomyTerms(text: string): boolean {
  return LEGACY_ECONOMY_TERMS.test(text);
}

function sanitizeLegacyEconomyTerms(text: string): string {
  return text
    .replace(/\bGold\s*\(GD\)\b/gi, 'legacy virtual currency')
    .replace(/\bDiamonds?\b/gi, 'legacy virtual currency')
    .replace(/\bStars?\b/gi, 'legacy virtual currency')
    .replace(/\bGD\b/gi, 'legacy virtual currency')
    .trim();
}

function streamText(text: string, source = 'knowledge-bank'): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const words = sanitizeAssistantBranding(text).split(' ');
      let i = 0;
      function push() {
        if (i >= words.length) {
          controller.close();
          return;
        }
        const chunk = (i === 0 ? '' : ' ') + words[i];
        controller.enqueue(encoder.encode(chunk));
        i++;
        setTimeout(push, 8);
      }
      push();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      'X-Answer-Source': source,
    },
  });
}

export async function POST(req: NextRequest) {
  const ip = sanitizeIp(req.headers.get('x-forwarded-for')?.split(',')[0].trim());
  const rl = rateLimit(`intelligent:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { messages: { role: string; content: string }[]; userName?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const { messages, userName } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages required' }), { status: 400 });
  }

  if (messages.length > 50) {
    return new Response(JSON.stringify({ error: 'Too many messages in context' }), { status: 400 });
  }

  const lastMessage = messages[messages.length - 1];
  const userQuestion = String(lastMessage?.content || '').slice(0, 2000);

  const cached = await searchKnowledgeBank(userQuestion);
  const isLiveEconomyQuestion = LIVE_ECONOMY_QUERY_TERMS.test(userQuestion);
  if (cached && !isLiveEconomyQuestion && cached.score >= 0.72 && !containsLegacyEconomyTerms(cached.answer)) {
    return streamText(cached.answer);
  }

  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!key) {
    if (cached && !isLiveEconomyQuestion && !containsLegacyEconomyTerms(cached.answer)) return streamText(cached.answer);
    return new Response(
      JSON.stringify({ error: 'AI service not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const systemPrompt = userName
    ? `${VIMORE_SYSTEM_PROMPT}\n\nThe user you are speaking with is named "${String(userName).slice(0, 50)}". Address them by their first name naturally in conversation.`
    : VIMORE_SYSTEM_PROMPT;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: systemPrompt,
    });

    // Do not let persisted conversations containing the retired economy leak
    // into the new assistant context.
    const history = messages.slice(0, -1)
      .filter((m) => !containsLegacyEconomyTerms(String(m.content)))
      .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content).slice(0, 2000) }],
      }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(userQuestion);

    let fullAnswer = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) fullAnswer += text;
    }
    const safeAnswer = sanitizeLegacyEconomyTerms(fullAnswer);
    if (safeAnswer.length >= 80 && userQuestion.length >= 8 && !containsLegacyEconomyTerms(userQuestion)) {
      saveToKnowledgeBank(userQuestion, safeAnswer).catch(() => {});
    }

      return streamText(sanitizeAssistantBranding(safeAnswer), 'gemini');
  } catch (err: any) {
    console.error('[Gemini intelligent error]', err);

    const isQuota =
      err?.status === 429 ||
      String(err?.message || '').includes('429') ||
      String(err?.message || '').includes('quota') ||
      String(err?.message || '').includes('RESOURCE_EXHAUSTED');

    if (isQuota) {
      if (cached && !isLiveEconomyQuestion && !containsLegacyEconomyTerms(cached.answer)) return streamText(cached.answer);
      return new Response(
        JSON.stringify({ error: 'quota_exceeded' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (cached && !isLiveEconomyQuestion && !containsLegacyEconomyTerms(cached.answer)) return streamText(cached.answer);

    return new Response(
      JSON.stringify({ error: err?.message || 'AI error' }),
      { status: 502 }
    );
  }
}
