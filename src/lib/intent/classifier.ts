/**
 * Intent Classification for RDC Saathi
 * Classifies user messages into predefined intents for routing
 */

export type Intent =
  | "greeting"
  | "about_rdc"
  | "ready_mix_education"
  | "products_services"
  | "plant_locations"
  | "ordering_process"
  | "contact_sales"
  | "commercial_intent"
  | "vision_2030"
  | "careers"
  | "quality_technology"
  | "sustainability"
  | "pricing"
  | "technical_question"
  | "complaint_feedback"
  | "faq_general"
  | "unknown";

interface IntentRule {
  intent: Intent;
  patterns: string[];
  weight: number; // 1-10, higher = more specific
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: "greeting",
    patterns: ["hello", "hi ", "hey", "good morning", "good evening", "namaste", "नमस्ते", "வணக்கம்", "నమస్కారం", "ನಮಸ್ಕಾರ", "നമസ്കാരം", "નમસ્કાર", "নমস্কার", "ਸਤਿ"],
    weight: 5,
  },
  {
    intent: "about_rdc",
    patterns: ["about rdc", "who is rdc", "what is rdc", "rdc company", "tell me about rdc", "rdc concrete", "company profile", "rdc history", "about company", "rdc के बारे"],
    weight: 8,
  },
  {
    intent: "ready_mix_education",
    patterns: ["what is ready mix", "ready mix concrete", "what is rmc", "rmc kya", "readymix", "batching plant", "site mixing vs", "concrete basics", "types of concrete", "m20 m25", "grade of concrete"],
    weight: 7,
  },
  {
    intent: "plant_locations",
    patterns: ["where are you", "which cities", "your locations", "presence in", "do you serve", "do you have a plant", "do you have plant", "plant in", "plant at", "plant near", "plant address", "plants in", "available in", "service in", "operate in", "branches", "near me", "कहाँ हैं", "किस शहर"],
    weight: 8,
  },
  {
    intent: "ordering_process",
    patterns: ["how to order", "place order", "how do i order", "ordering process", "book concrete", "schedule delivery", "delivery process", "how to buy", "customer connect", "order kaise"],
    weight: 8,
  },
  {
    intent: "contact_sales",
    patterns: ["contact", "phone number", "call", "email", "sales team", "sales person", "reach you", "connect with", "speak to", "customer care", "helpline", "number do", "संपर्क"],
    weight: 6,
  },
  {
    intent: "commercial_intent",
    patterns: ["i need concrete", "require concrete", "want to buy", "quotation", "quote please", "pricing", "rate", "supply to my", "project requirement", "bulk order", "tender", "contractor need", "my project"],
    weight: 9,
  },
  {
    intent: "vision_2030",
    patterns: ["vision 2030", "future plans", "expansion", "growth strategy", "rdc future", "rdc goals", "five year", "strategic plan"],
    weight: 9,
  },
  {
    intent: "careers",
    patterns: ["job", "career", "vacancy", "hiring", "recruitment", "work at rdc", "apply for", "internship", "employment", "join rdc"],
    weight: 7,
  },
  {
    intent: "quality_technology",
    patterns: ["quality", "qms", "iso", "certification", "strength", "grade", "cube test", "slump", "admixture", "technology", "erp", "software", "tracking", "rdctrak"],
    weight: 7,
  },
  {
    intent: "sustainability",
    patterns: ["sustainability", "green", "eco", "environment", "carbon", "waste", "recycle", "fly ash", "ggbs", "slag"],
    weight: 7,
  },
  {
    intent: "pricing",
    patterns: ["price", "cost", "rate per", "how much", "charges", "per cubic", "per m3", "kitna", "cost kya"],
    weight: 9,
  },
  {
    intent: "technical_question",
    patterns: ["compressive strength", "water cement ratio", "slump value", "mix design", "rebar", "reinforcement", "formwork", "curing time", "grade m30", "pcc", "rcc", "design mix"],
    weight: 8,
  },
  {
    intent: "complaint_feedback",
    patterns: ["complaint", "problem", "issue", "bad service", "wrong delivery", "delayed", "feedback", "not happy", "poor quality"],
    weight: 7,
  },
  {
    intent: "faq_general",
    patterns: ["faq", "common questions", "frequently asked", "how long", "minimum order", "transit mixer", "transit time"],
    weight: 5,
  },
];

export interface ClassificationResult {
  intent: Intent;
  confidence: number; // 0-1
  isCommercial: boolean;
  shouldCaptureLead: boolean;
}

/**
 * Classify intent from user message
 */
export function classifyIntent(message: string): ClassificationResult {
  const lower = message.toLowerCase();

  let bestIntent: Intent = "unknown";
  let bestScore = 0;

  for (const rule of INTENT_RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        score += rule.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = rule.intent;
    }
  }

  const confidence = Math.min(bestScore / 10, 1);
  const isCommercial = bestIntent === "commercial_intent" || bestIntent === "pricing" || bestIntent === "contact_sales";
  const shouldCaptureLead = isCommercial || (bestIntent === "ordering_process" && confidence > 0.5);

  return {
    intent: bestScore > 0 ? bestIntent : "unknown",
    confidence: bestScore > 0 ? confidence : 0.1,
    isCommercial,
    shouldCaptureLead,
  };
}

/**
 * Get a human-readable label for an intent
 */
export function getIntentLabel(intent: Intent): string {
  const labels: Record<Intent, string> = {
    greeting: "Greeting",
    about_rdc: "About RDC",
    ready_mix_education: "Ready-Mix Education",
    products_services: "Products & Services",
    plant_locations: "Plant Locations",
    ordering_process: "Ordering Process",
    contact_sales: "Contact / Sales",
    commercial_intent: "Commercial Inquiry",
    vision_2030: "Vision 2030",
    careers: "Careers",
    quality_technology: "Quality & Technology",
    sustainability: "Sustainability",
    pricing: "Pricing",
    technical_question: "Technical Question",
    complaint_feedback: "Complaint / Feedback",
    faq_general: "General FAQ",
    unknown: "Unknown",
  };
  return labels[intent] || intent;
}
