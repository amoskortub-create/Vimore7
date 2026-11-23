import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { saveToKnowledgeBank, searchKnowledgeBank } from '@/lib/knowledge-bank';
import { getAuthenticatedProfile } from '@/lib/server-helpers';

const SYSTEM_PROMPT = `You are Mesurado Ai, the helpful built-in intelligent assistant for ViMore (built by Media Tech Liberia).
Answer clearly, concisely, and accurately. Never reference deprecated currencies like diamonds, gold, or stars; ViMore uses Credits and Liberian Dollars (LD) for creator monetization.`;

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthenticatedProfile(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const messages: Array<{ role: string; content: string }> = Array.isArray(body.messages)
      ? body.messages
      : [];
    const userName = String(body.userName || session.profileDoc?.name || 'Friend');

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() || '';
    if (!lastUserMessage) {
      return NextResponse.json({ error: 'Message content required' }, { status: 400 });
    }

    const cached = await searchKnowledgeBank(lastUserMessage);
    if (cached?.answer) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(cached.answer));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallback = `Hi ${userName}, Mesurado Ai is currently running in offline mode because GEMINI_API_KEY is not configured yet.`;
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(fallback));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const historyPrompt = messages
      .slice(-12)
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : userName}: ${m.content}`)
      .join('\n\n');

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: historyPrompt,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\nThe user's first name is ${userName}.`,
      },
    });

    const encoder = new TextEncoder();
    let fullAnswer = '';

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text || '';
            if (text) {
              fullAnswer += text;
              controller.enqueue(encoder.encode(text));
            }
          }
          if (fullAnswer.trim().length > 0) {
            void saveToKnowledgeBank(lastUserMessage, fullAnswer);
          }
          controller.close();
        } catch (err: any) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err: any) {
    const status = err?.status === 429 || /429|quota/i.test(String(err?.message)) ? 429 : 500;
    return NextResponse.json({ error: err?.message || 'AI request failed' }, { status });
  }
}
