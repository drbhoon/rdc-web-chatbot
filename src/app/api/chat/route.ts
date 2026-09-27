/**
 * POST /api/chat
 * Main chat endpoint — orchestrates the full conversation pipeline
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectLanguage } from "@/lib/i18n/languageDetector";
import {
  detectRequestedLanguage,
  isOnlyLanguageSwitch,
  languageSwitchAcknowledgement,
} from "@/lib/i18n/languagePreference";
import { normalizeQueryForRetrieval } from "@/lib/i18n/queryNormalizer";
import { classifyIntent } from "@/lib/intent/classifier";
import { retrieveRelevantChunks } from "@/lib/knowledge/retrieval";
import { generateAIResponse } from "@/lib/ai/aiService";
import { performWebSearch, shouldUseWebSearch } from "@/lib/search/webSearch";
import { handleEmployeeDirectoryMessage } from "@/lib/employee/directory";
import { recordUnanswered } from "@/lib/knowledge/unanswered";
import { rateLimited } from "@/lib/rateLimit";
import { v4 as uuidv4 } from "uuid";

export interface ChatRequest {
  message: string;
  sessionId?: string | null;
  language?: string; // Override detected language
}

export interface ChatResponse {
  message: string;
  sessionId: string;
  detectedLanguage: string;
  intent: string;
  suggestLeadCapture: boolean;
  usedWebSearch: boolean;
  usedMockMode: boolean;
  processingMs: number;
}

const LANGUAGE_NEUTRAL_FOLLOW_UP_PATTERN =
  /^\s*(?:\d{6}[.。।,!?]?|[A-Z0-9._%+-]+@rdc\.in)\s*$/i;

const SUPPORTED_LANGUAGE_OVERRIDES = new Set([
  "en", "hi", "mr", "ta", "te", "kn", "ml", "gu", "pa", "bn", "or", "ur", "as",
]);

export async function POST(req: NextRequest) {
  if (rateLimited(req, "chat")) return NextResponse.json({error: "Please try again in one minute."}, {status: 429});
  const startTime = Date.now();

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, sessionId: requestedSessionId } = body;

  if (typeof message !== "string" || !message.trim() || message.length > 4000 || (requestedSessionId != null && typeof requestedSessionId !== "string")) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const existingSessionId = typeof requestedSessionId === "string" ? requestedSessionId : undefined;

  // ── 1. Session Management ──────────────────────────────────────────────────
  let sessionId = existingSessionId;
  let session = sessionId
    ? await prisma.chatSession.findUnique({ where: { id: sessionId } })
    : null;

  if (!session) {
    sessionId = uuidv4();
    session = await prisma.chatSession.create({
      data: {
        id: sessionId,
        sourcePage: req.headers.get("referer") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      },
    });

    // Log session start event
    await prisma.analyticsEvent.create({
      data: {
        sessionId,
        eventType: "session_start",
        language: "en",
      },
    });
  }

  // ── 2. Language Detection ──────────────────────────────────────────────────
  const languageOverride =
    typeof body.language === "string" && SUPPORTED_LANGUAGE_OVERRIDES.has(body.language)
      ? body.language
      : null;
  const requestedLanguage = detectRequestedLanguage(message);
  let detectedLanguage = languageOverride || requestedLanguage || (await detectLanguage(message));
  if (
    !languageOverride &&
    !requestedLanguage &&
    session.language !== "en" &&
    detectedLanguage === "en" &&
    LANGUAGE_NEUTRAL_FOLLOW_UP_PATTERN.test(message)
  ) {
    detectedLanguage = session.language;
  }
  // Update session language if changed
  if (detectedLanguage !== session.language) {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { language: detectedLanguage },
    });
  }

  // ── 3. Intent Classification ───────────────────────────────────────────────
  const classification = classifyIntent(message);
  const normalizedQuery = await normalizeQueryForRetrieval(message, detectedLanguage);

  // ── 4. Get Conversation History ────────────────────────────────────────────
  const recentMessages = await prisma.chatMessage.findMany({
    where: { sessionId: sessionId! },
    orderBy: { createdAt: "desc" },
    take: 10, // last 10 messages for context
  });

  const conversationHistory = recentMessages.reverse().filter(m => m.intent !== "employee_directory").map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // ── 5. Save User Message ───────────────────────────────────────────────────
  const userMsgRecord = await prisma.chatMessage.create({
    data: {
      id: uuidv4(),
      sessionId: sessionId!,
      role: "user",
      content: message,
      language: detectedLanguage,
      intent: classification.intent,
      confidence: classification.confidence,
    },
  });

  if (!languageOverride && requestedLanguage && isOnlyLanguageSwitch(message)) {
    const processingMs = Date.now() - startTime;
    const reply = languageSwitchAcknowledgement(requestedLanguage);

    await prisma.chatMessage.create({
      data: {
        id: uuidv4(),
        sessionId: sessionId!,
        role: "assistant",
        content: reply,
        language: detectedLanguage,
        intent: "language_switch",
        confidence: 1,
        processingMs,
      },
    });

    await prisma.analyticsEvent.create({
      data: {
        sessionId: sessionId!,
        eventType: "language_switch",
        language: detectedLanguage,
        intent: "language_switch",
      },
    });

    return NextResponse.json({
      message: reply,
      sessionId: sessionId!,
      detectedLanguage,
      intent: "language_switch",
      suggestLeadCapture: false,
      usedWebSearch: false,
      usedMockMode: false,
      processingMs,
    } satisfies ChatResponse);
  }

  // ── 6. Retrieve Relevant Knowledge ────────────────────────────────────────
  const employeeResult = await handleEmployeeDirectoryMessage(message, sessionId!, detectedLanguage);
  if (employeeResult.handled) {
    const processingMs = Date.now() - startTime;
    await prisma.chatMessage.create({
      data: {
        id: uuidv4(),
        sessionId: sessionId!,
        role: "assistant",
        content: employeeResult.message || "",
        language: detectedLanguage,
        intent: "employee_directory",
        confidence: 1,
        processingMs,
      },
    });

    await prisma.analyticsEvent.create({
      data: {
        sessionId: sessionId!,
        eventType: employeeResult.eventType || "employee_directory",
        language: detectedLanguage,
        intent: "employee_directory",
        metadata: JSON.stringify(employeeResult.metadata || {}),
      },
    });

    return NextResponse.json({
      message: employeeResult.message || "",
      sessionId: sessionId!,
      detectedLanguage,
      intent: "employee_directory",
      suggestLeadCapture: false,
      usedWebSearch: false,
      usedMockMode: false,
      processingMs,
    } satisfies ChatResponse);
  }

  let retrievalFailed = false;
  const chunks = await retrieveRelevantChunks(normalizedQuery.retrievalQuery, { topK: 12 }).catch(() => {
    retrievalFailed = true;
    return [];
  });
  const topScore = chunks[0]?.score || 0;
  const topVectorScore = chunks.find((chunk) => chunk.retrievalMode === "vector")?.score || 0;

  // ── 7. Optional Web Search ─────────────────────────────────────────────────
  let webSearchContext: string | undefined;
  let usedWebSearch = false;

  if (shouldUseWebSearch(classification.intent, chunks.length, Math.max(topScore, topVectorScore), message)) {
    const searchQuery = `RDC Concrete India ${normalizedQuery.retrievalQuery}`;
    const webResult = await performWebSearch(searchQuery);
    webSearchContext = webResult.formattedContext;
    usedWebSearch = webResult.usedSearch;
  }

  // ── 8. Generate AI Response ────────────────────────────────────────────────
  const aiResult = retrievalFailed ? {
    content: detectedLanguage === "hi" ? "अभी जानकारी की पुष्टि नहीं कर पा रही हूं। आपका प्रश्न समीक्षा के लिए दर्ज किया गया है।" : "I cannot check the knowledge base right now. Your question has been recorded for review.",
    confidence: 0, usedMockMode: false, suggestLeadCapture: false, unanswered: true, provider: "unavailable",
  } : await generateAIResponse({
    userMessage: message,
    retrievalQuery: normalizedQuery.retrievalQuery,
    conversationHistory,
    detectedLanguage,
    intent: classification.intent,
    retrievedChunks: chunks,
    webSearchResults: webSearchContext,
    sessionId: sessionId!,
  });

  if (aiResult.unanswered) {
    await recordUnanswered(message, detectedLanguage, aiResult.provider === "unavailable" ? "provider_unavailable" : "insufficient_knowledge");
  }

  // ── 9. Save Assistant Response ─────────────────────────────────────────────
  await prisma.chatMessage.create({
    data: {
      id: uuidv4(),
      sessionId: sessionId!,
      role: "assistant",
      content: aiResult.content,
      language: detectedLanguage,
      intent: classification.intent,
      confidence: aiResult.confidence,
      retrievedChunks: JSON.stringify(chunks.map((c) => c.id)),
      usedWebSearch,
      usedMockMode: aiResult.usedMockMode,
      leadCtaShown: aiResult.suggestLeadCapture,
      processingMs: Date.now() - startTime,
    },
  });

  // Update the user message record with classification info
  await prisma.chatMessage.update({
    where: { id: userMsgRecord.id },
    data: {
      retrievedChunks: JSON.stringify(chunks.map((c) => c.id)),
      usedWebSearch,
    },
  });

  // ── 10. Analytics Event ────────────────────────────────────────────────────
  await prisma.analyticsEvent.create({
    data: {
      sessionId: sessionId!,
      eventType: "message_sent",
      language: detectedLanguage,
      intent: classification.intent,
      metadata: JSON.stringify({
        chunksRetrieved: chunks.length,
        topScore,
        topVectorScore,
        retrievalModes: chunks.map((chunk) => chunk.retrievalMode || "unknown"),
        retrievalQuery: normalizedQuery.retrievalQuery,
        queryNormalizer: normalizedQuery.provider,
        usedOpenAIQueryNormalizer: normalizedQuery.usedOpenAI,
        usedWebSearch,
        usedMockMode: aiResult.usedMockMode,
        confidence: classification.confidence,
      }),
    },
  });

  const processingMs = Date.now() - startTime;

  const response: ChatResponse = {
    message: aiResult.content,
    sessionId: sessionId!,
    detectedLanguage,
    intent: classification.intent,
    suggestLeadCapture: aiResult.suggestLeadCapture,
    usedWebSearch,
    usedMockMode: aiResult.usedMockMode,
    processingMs,
  };

  return NextResponse.json(response);
}
