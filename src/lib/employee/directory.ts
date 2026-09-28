import { loadEmployees } from "@/lib/employee/workbook";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { PLANT_LOCATIONS } from "@/lib/facts";

const EMPLOYEE_LOOKUP_PATTERNS = [
  /\btell me about\s+([a-z][a-z .'-]{2,})/i,
  /\binformation about(?:\s+employee)?\s+([a-z][a-z .'-]{2,})/i,
  /\b(?:i\s+)?want to know about(?:\s+employee)?\s+([a-z][a-z .'-]{2,})/i,
  /\bwho is\s+([a-z][a-z .'-]{2,})/i,
  /\bemployee\s+(?:named\s+|name\s+)?([a-z][a-z .'-]{2,})/i,
  /\b([a-z][a-z .'-]{2,})\s+ke\s+(?:bare|baare)(?:\s+mein)?(?:\s+batao|\s+bataye|\s+bataen|\s+bataein|\s+bataiye)?/i,
  /(?:इन्फॉर्मेशन|इनफॉरमेशन)\s+अबाउट\s+(?:एम्पलाई\s+|कर्मचारी\s+)?([\p{L}\p{M} .'-]{2,})/iu,
  /अबाउट\s+(?:एम्पलाई\s+|कर्मचारी\s+)?([\p{L}\p{M} .'-]{2,})/iu,
  /(?:एम्पलाई|कर्मचारी)\s+([\p{L}\p{M} .'-]{2,})/iu,
  /([\p{L}\p{M}][\p{L}\p{M} .'-]{2,})\s+(?:के बारे|बारे में|की जानकारी|की इनफॉरमेशन|की इन्फॉर्मेशन)/iu,
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@rdc\.in\b/i;
const EMPLOYEE_INTENT_PATTERN =
  /\b(?:employee|employees|emp|staff|person)\b|कर्मचारी|एम्पलाई|एम्प्लाई|एम्प्लॉई|एंप्लॉयी|स्टाफ/i;
const EMPLOYEE_NEGATION_PATTERN =
  /\b(?:do\s+not|don't|dont|no|not)\s+(?:want|need)?\s*(?:any\s+)?(?:employee|employees|emp|staff)\b|डॉन'?ट|डोंट|नहीं\s+चाहिए|मत\s+दो|एम्पलाई\s+नहीं|कर्मचारी\s+नहीं/i;
const COMPANY_TOPIC_PATTERN =
  /\b(?:rdc|rdc concrete|rmc|concrete|company|business|vision|customer connect|rdctrak|qms|erp|deeksha|my setu)\b|आरडीसी|आर\s*डी\s*सी|कंकरीट|कॉन्क्रीट|कंपनी|बिजनेस|विजन/i;
const OTP_PATTERN = /^\s*(\d{6})\s*[.。।,!?]?\s*$/;

const MAX_EMPLOYEE_LOOKUPS_PER_CODE = 10;

// Verification e-mails go to any @rdc.in address a visitor types, so without a
// cap one visitor could fill a colleague's inbox with RDC-branded codes.
const MAX_CODES_PER_ADDRESS_PER_DAY = 5;
const MAX_CODES_PER_CHAT_PER_HOUR = 3;

// Words that make a phrase a question about a role or a thing, not a person's
// name: "who is your managing director" must not start an employee lookup.
const NOT_NAME_WORDS = new Set([
  "the", "your", "our", "a", "an", "of", "for", "in", "at", "my", "this", "that",
  "md", "ceo", "cfo", "coo", "chairman", "chairperson", "director", "directors", "founder", "founders",
  "head", "president", "owner", "promoter", "promoters", "manager", "management", "team", "leader", "leadership",
  "contact", "person", "plant", "office", "branch", "number", "phone", "price", "rate", "order", "delivery",
]);

export interface EmployeeDirectoryResult {
  handled: boolean;
  message?: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasEmployeeLookupIntent(message: string): boolean {
  return EMPLOYEE_INTENT_PATTERN.test(message);
}

function isEmployeeNegation(message: string): boolean {
  return EMPLOYEE_NEGATION_PATTERN.test(message);
}

function isCompanyTopic(message: string): boolean {
  return COMPANY_TOPIC_PATTERN.test(message);
}

const DEVANAGARI_TO_LATIN: Record<string, string> = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "ee",
  उ: "u",
  ऊ: "oo",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
  "ा": "a",
  "ि": "i",
  "ी": "ee",
  "ु": "u",
  "ू": "oo",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ं": "n",
  "ँ": "n",
  ण: "n",
  "्": "",
};

function transliterateDevanagari(text: string): string {
  return Array.from(text)
    .map((char) => DEVANAGARI_TO_LATIN[char] ?? char)
    .join("");
}

function phoneticToken(token: string): string {
  return token
    .replace(/c/g, "k")
    .replace(/(.)\1+/g, "$1")
    .replace(/aa|ee|oo/g, (match) => match[0])
    .replace(/v/g, "w");
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let lastDiagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] =
        a[i - 1] === b[j - 1]
          ? lastDiagonal
          : Math.min(previous[j - 1], previous[j], lastDiagonal) + 1;
      lastDiagonal = temp;
    }
  }
  return previous[b.length];
}

function tokenMatches(queryToken: string, employeeToken: string): boolean {
  if (queryToken.length === 1) return employeeToken.startsWith(queryToken);
  if (employeeToken.length === 1) return queryToken.startsWith(employeeToken);

  if (queryToken.length >= 3 && employeeToken.includes(queryToken)) return true;
  if (employeeToken.length >= 3 && queryToken.includes(employeeToken)) return true;

  const queryPhonetic = phoneticToken(queryToken);
  const employeePhonetic = phoneticToken(employeeToken);
  if (queryPhonetic.length >= 3 && employeePhonetic.includes(queryPhonetic)) return true;
  if (employeePhonetic.length >= 3 && queryPhonetic.includes(employeePhonetic)) return true;

  const allowedDistance = Math.max(queryToken.length, employeeToken.length) <= 5 ? 1 : 2;
  return editDistance(queryPhonetic, employeePhonetic) <= allowedDistance;
}

function searchVariants(name: string): string[] {
  const cleanedName = cleanEmployeeName(name);
  const variants = new Set([normalizeName(cleanedName)]);
  if (/[\u0900-\u097F]/.test(cleanedName)) {
    variants.add(normalizeName(transliterateDevanagari(cleanedName)));
  }
  return Array.from(variants).filter(Boolean);
}

function cleanEmployeeName(name: string): string {
  return name
    .replace(/[?.!,।]+$/g, "")
    .replace(/^(?:क्या\s+(?:आप\s+)?(?:मुझे\s+)?|मुझे\s+|आप\s+मुझे\s+)/i, "")
    .replace(/^(?:main\s+)?kya\s+(?:aap\s+)?mujhe\s+/i, "")
    .replace(/^(?:kya\s+aap\s+mujhe|kya\s+aap|mujhe)\s+/i, "")
    .replace(/^(?:please|pls|kindly|kripya|कृपया|प्लीज)\s+/i, "")
    .replace(/^(?:about|employee|emp|एम्पलाई|कर्मचारी)\s+/i, "")
    .replace(/^(?:named|name(?:d)?\s+is)\s+/i, "")
    .replace(/\s+(?:in\s+)?(?:hindi|english|angrezi|angreji)(?:\s+(?:me|mein|main))?$/i, "")
    .replace(/\s+(?:के|की|का|के बारे|के बारे में|की जानकारी)$/i, "")
    .replace(/\s+(?:please|pls|kindly|kripya|batao|bataye|bataen|bataein|bataiye|बताओ|बताएं|बताइए|जानकारी)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyEmployeeName(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  if (isCompanyTopic(name) || isEmployeeNegation(name)) return false;

  const blockedTerms = [
    "rdc",
    "rdc concrete",
    "rmc",
    "vision",
    "vision 2030",
    "concrete",
    "customer connect",
    "rdctrak",
    "qms",
    "erp",
    "deeksha",
    "my setu",
    "company",
    "business",
    "employee",
    "employees",
    "emp",
    "staff",
    "information",
    "details",
    "any employee",
    "आरडीसी",
    "कंकरीट",
    "कॉन्क्रीट",
    "कंपनी",
    "एम्पलाई",
    "कर्मचारी",
  ];
  if (blockedTerms.some((term) => normalized === term || normalized.includes(term))) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.some((token) => NOT_NAME_WORDS.has(token))) return false;
  return tokens.length >= 2;
}

function isPossibleSingleEmployeeName(name: string): boolean {
  const normalized = normalizeName(name);
  if (!normalized || normalized.includes(" ")) return false;
  if (normalized.length < 4) return false;
  if (isCompanyTopic(name) || isEmployeeNegation(name)) return false;
  if (NOT_NAME_WORDS.has(normalized)) return false;
  return true;
}

/** Exported for tests. */
export function extractEmployeeName(message: string): string | null {
  if (isEmployeeNegation(message) || isCompanyTopic(message)) return null;

  for (const pattern of EMPLOYEE_LOOKUP_PATTERNS) {
    const match = message.match(pattern);
    const rawName = match?.[1]?.trim();
    if (!rawName) continue;

    const name = cleanEmployeeName(rawName);
    if (isLikelyEmployeeName(name) || isPossibleSingleEmployeeName(name)) return name;
  }
  return null;
}

// A message that is nothing but a name ("Asha Example") is a lookup too. The
// check never consults the directory: real and made-up names get the same
// verification reply, so typing names reveals nothing about who works at RDC.
// These words and places make a short message something other than a name.
const BARE_NOT_NAME_WORDS = new Set([
  // greetings, replies, courtesy
  "hi", "hii", "hello", "hey", "namaste", "namaskar", "thanks", "thank", "thx", "ok", "okay", "yes", "no", "sure",
  "good", "morning", "afternoon", "evening", "night", "bye", "welcome", "please", "sorry", "great", "nice", "fine", "done",
  // question and function words (English and Hinglish)
  "what", "who", "where", "when", "why", "how", "which", "whom", "whose", "is", "are", "was", "can", "could", "would",
  "will", "do", "does", "did", "and", "or", "to", "from", "with", "about", "tell", "show", "give", "need", "want", "know",
  "kya", "kaun", "kahan", "kaise", "kab", "kyun", "kitna", "kitne", "hai", "hain", "ka", "ki", "ke", "me", "mein", "aur",
  "hindi", "english",
  // concrete, ordering and the assistant itself
  "ready", "mix", "readymix", "concrete", "cement", "grade", "slab", "pump", "pumping", "boom", "quote", "quotation",
  "cost", "supply", "site", "project", "plants", "location", "locations", "address", "email", "whatsapp", "tara",
  "online", "saathi", "sales", "support", "complaint", "help", "service", "services", "quality", "test", "cube",
  "strength", "aggregate", "sand", "admixture", "steel", "mixer", "transit", "truck", "booking", "book", "career", "careers", "job", "jobs",
  // place words
  "west", "east", "north", "south", "road", "nagar", "city", "town", "district", "state", "india", "pradesh", "bypass", "sector", "phase",
  "नमस्ते", "नमस्कार", "धन्यवाद", "शुक्रिया", "हाँ", "हां", "नहीं", "ठीक", "क्या", "कौन", "कहाँ", "कहां", "कैसे",
  "ऑर्डर", "प्राइस", "रेट", "प्लांट", "डिलीवरी", "कंक्रीट", "सीमेंट",
]);
// Whole place names: plant locations and localities, and cities people type.
const PLACE_NAMES = new Set([
  ...PLANT_LOCATIONS.flatMap((place) => [place.name, ...(place.localities || [])]).map((p) => normalizeName(p)),
  "navi mumbai", "new delhi", "thane west", "greater noida", "tamil nadu", "west bengal", "jammu kashmir",
]);

/** Exported for tests: the name, when the whole message looks like one. */
export function bareEmployeeName(message: string, allowSingleWord = false): string | null {
  const name = cleanEmployeeName(message.trim());
  if (!/^[\p{L}\p{M} .'-]+$/u.test(name)) return null; // digits, e-mails, sentences with commas
  const normalized = normalizeName(name);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length > 4 || tokens.length === 0 || (tokens.length === 1 && !allowSingleWord)) return null;
  // Initials ("K. Ramesh") are fine, but not a message of initials alone.
  if (!tokens.some((t) => t.length >= 3)) return null;
  if (tokens.some((t) => BARE_NOT_NAME_WORDS.has(t) || NOT_NAME_WORDS.has(t))) return null;
  if (PLACE_NAMES.has(normalized)) return null;
  if (tokens.length === 1) return isPossibleSingleEmployeeName(name) ? name : null;
  return isLikelyEmployeeName(name) ? name : null;
}

function extractRdcEmail(message: string): string | null {
  return message.match(EMAIL_PATTERN)?.[0].toLowerCase() || null;
}

function hashCode(code: string): string {
  const secret = process.env.EMPLOYEE_OTP_SECRET || process.env.ADMIN_JWT_SECRET || "rdc_employee_otp";
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

function createOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function isMailConfigured(): boolean {
  const smtpPass = process.env.SMTP_PASS?.trim() || "";
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      smtpPass &&
      smtpPass !== "replace_with_app_password" &&
      process.env.SMTP_FROM
  );
}

async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error("SMTP is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS?.replace(/\s+/g, ""),
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your TARA Online verification code",
    text: `Your TARA Online verification code is ${code}. This code is valid for 10 minutes.`,
    html: `<p>Your TARA Online verification code is <strong>${code}</strong>.</p><p>This code is valid for 10 minutes.</p>`,
  });
}

async function findEmployee(name: string) {
  const variants = searchVariants(name);
  const queryTokenSets = variants.map((variant) => variant.split(" ").filter(Boolean));
  const significantTokens = Array.from(new Set(queryTokenSets.flat()));

  if (!significantTokens.length) return null;

  const candidates = await loadEmployees();

  return candidates
    .map((employee) => {
      const employeeName = normalizeName(employee.name);
      const employeeTokens = employeeName.split(" ").filter(Boolean);

      let score = 0;
      for (const variant of variants) {
        if (employeeName === variant) score += 100;
        if (employeeName.includes(variant)) score += 50;
        if (employeeName.startsWith(variant)) score += 25;
      }

      for (const queryTokens of queryTokenSets) {
        const availableEmployeeTokens = [...employeeTokens];
        const matchedTokens = queryTokens.filter((queryToken) => {
          const matchedIndex = availableEmployeeTokens.findIndex((employeeToken) =>
            tokenMatches(queryToken, employeeToken)
          );
          if (matchedIndex === -1) return false;
          availableEmployeeTokens.splice(matchedIndex, 1);
          return true;
        });
        if (matchedTokens.length !== queryTokens.length) continue;

        score += matchedTokens.length * 20;
        score += queryTokens.filter((token) => token.length === 1).length * 10;
        score -= Math.max(0, employeeTokens.length - queryTokens.length);
      }
      return { employee, score };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.employee || null;
}

function formatEmployee(employee: Awaited<ReturnType<typeof findEmployee>>, language: string): string {
  if (!employee) {
    return language === "hi"
      ? "मुझे current employee directory database में matching employee record नहीं मिला."
      : "I could not find a matching employee record in the current directory database.";
  }

  const fields = [
    employee.qualification ? `- Qualification: ${employee.qualification}` : null,
    employee.city ? `- City: ${employee.city}` : null,
    employee.location ? `- Location: ${employee.location}` : null,
    employee.department ? `- Department: ${employee.department}` : null,
    employee.designation ? `- Designation: ${employee.designation}` : null,
  ].filter(Boolean);

  if (language === "hi") {
    return [
      `**${employee.name}** के लिए available employee information:`,
      "",
      ...fields,
      "",
      "यह जानकारी RDC-verified users के लिए internal employee directory से ली गई है.",
    ].join("\n");
  }

  return [
    `I found the available details for **${employee.name}**:`,
    "",
    ...fields,
    "",
    "This is from RDC's internal employee directory for verified users.",
  ].join("\n");
}

async function latestPendingOtp(sessionId: string) {
  return prisma.employeeOtp.findFirst({
    where: {
      sessionId,
      verifiedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function latestVerifiedOtp(sessionId: string) {
  return prisma.employeeOtp.findFirst({
    where: {
      sessionId,
      verifiedAt: { not: null },
      expiresAt: { gt: new Date() },
    },
    orderBy: { verifiedAt: "desc" },
  });
}

async function latestActiveVerifiedEmployeeAuth(sessionId: string) {
  return prisma.employeeOtp.findFirst({
    where: {
      sessionId,
      email: { not: null },
      verifiedAt: { not: null },
      expiresAt: { gt: new Date() },
    },
    orderBy: { verifiedAt: "desc" },
  });
}

type VerifiedEmployeeAuth = NonNullable<Awaited<ReturnType<typeof latestActiveVerifiedEmployeeAuth>>>;

async function employeeLookupCountForCode(auth: VerifiedEmployeeAuth): Promise<number> {
  if (!auth.email) return 0;

  return prisma.employeeOtp.count({
    where: {
      sessionId: auth.sessionId,
      email: auth.email,
      verifiedAt: { not: null },
      expiresAt: auth.expiresAt,
    },
  });
}

async function recordVerifiedEmployeeLookup(auth: VerifiedEmployeeAuth, employeeName: string): Promise<void> {
  await prisma.employeeOtp.create({
    data: {
      sessionId: auth.sessionId,
      employeeName,
      email: auth.email,
      verifiedAt: new Date(),
      expiresAt: auth.expiresAt,
    },
  });
}

function isRepeatEmployeeInfoRequest(message: string): boolean {
  if (hasEmployeeLookupIntent(message)) return false;

  return (
    /\b(?:same|that|previous|last)\s+(?:info|information|details?)\b/i.test(message) ||
    /\b(?:yahi|wahi|pichli|pehle wali)\s+(?:info|information|details?)\b/i.test(message) ||
    /\b(?:repeat|translate)\s+(?:it|this|that)?\s*(?:again)?\s*(?:in\s+hindi|in\s+english)?\b/i.test(message) ||
    /\b(?:say|tell)\s+(?:it|this|that)\s*(?:again)?\s*(?:in\s+hindi|in\s+english)?\b/i.test(message) ||
    /(?:यही|वही|पिछली|पहले वाली).*(?:information|info|जानकारी)/i.test(message) ||
    /(?:hindi|हिंदी|हिन्दी|english|इंग्लिश|अंग्रेजी).*(?:bata|बताएं|बताइए|बताओ|information|info|जानकारी)/i.test(message)
  );
}

function employeePrompt(name: string, language: string): string {
  if (language === "hi") {
    return `Employee privacy के लिए कृपया अपनी company email ID दर्ज करें जो @rdc.in पर समाप्त होती हो. Verification code भेजने के बाद मैं ${name} के बारे में available information दिखा दूंगी. एक verification से इस chat में ${MAX_EMPLOYEE_LOOKUPS_PER_CODE} employees तक lookup कर सकते हैं.`;
  }

  return `For employee privacy, please enter your company email ID ending with @rdc.in. I will send a verification code before showing available information about ${name}. One verification can be used for up to ${MAX_EMPLOYEE_LOOKUPS_PER_CODE} employee lookups in this chat.`;
}

export async function handleEmployeeDirectoryMessage(
  message: string,
  sessionId: string,
  language = "en"
): Promise<EmployeeDirectoryResult> {
  const otpMatch = message.match(OTP_PATTERN);
  // Six digits is also an Indian PIN code, and "which area?" is the bot's own
  // question to a customer. Only treat it as a verification code when this
  // chat has actually been sent one; otherwise it is an ordinary message.
  const awaitingCode = otpMatch ? await latestPendingOtp(sessionId) : null;
  if (otpMatch && awaitingCode?.codeHash) {
    const pending = awaitingCode;

    if (pending.attempts >= 5) {
      return {
        handled: true,
        message:
          language === "hi"
            ? "इस verification request में बहुत अधिक attempts हो चुके हैं. कृपया employee name से फिर शुरू करें."
            : "This verification request has too many attempts. Please start again with the employee name.",
        eventType: "employee_otp_locked",
      };
    }

    if (hashCode(otpMatch[1]) !== pending.codeHash) {
      await prisma.employeeOtp.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      return {
        handled: true,
        message:
          language === "hi"
            ? "यह code सही नहीं है. कृपया email में आया 6-digit code फिर से enter करें."
            : "That code is not correct. Please check the email and enter the 6-digit code again.",
        eventType: "employee_otp_failed",
      };
    }

    await prisma.employeeOtp.update({
      where: { id: pending.id },
      data: { verifiedAt: new Date() },
    });

    const employee = await findEmployee(pending.employeeName);
    return {
      handled: true,
      message: formatEmployee(employee, language),
      eventType: "employee_lookup_completed",
      metadata: {
        employeeName: pending.employeeName,
        requesterEmail: pending.email,
        found: Boolean(employee),
        remainingLookups: MAX_EMPLOYEE_LOOKUPS_PER_CODE - 1,
      },
    };
  }

  if (isRepeatEmployeeInfoRequest(message)) {
    const verified = await latestVerifiedOtp(sessionId);
    if (verified) {
      const employee = await findEmployee(verified.employeeName);
      return {
        handled: true,
        message: formatEmployee(employee, language),
        eventType: "employee_lookup_repeated",
        metadata: {
          employeeName: verified.employeeName,
          requesterEmail: verified.email,
          found: Boolean(employee),
        },
      };
    }
  }

  if (isEmployeeNegation(message)) {
    return { handled: false };
  }

  const email = extractRdcEmail(message);
  if (email) {
    const pending = await latestPendingOtp(sessionId);
    if (!pending) {
      return {
        handled: true,
        message:
          language === "hi"
            ? "धन्यवाद. कृपया पहले employee के बारे में पूछें, जैसे: “Tell me about <employee name>”."
            : "Thanks. Please first ask for an employee, for example: “Tell me about <employee name>”.",
        eventType: "employee_email_without_lookup",
      };
    }

    const since = (ms: number) => new Date(Date.now() - ms);
    const [sentToAddress, sentInChat] = await Promise.all([
      prisma.employeeOtp.count({ where: { email, codeHash: { not: null }, createdAt: { gte: since(24 * 3600 * 1000) } } }),
      prisma.employeeOtp.count({ where: { sessionId, codeHash: { not: null }, createdAt: { gte: since(3600 * 1000) } } }),
    ]);
    if (sentToAddress >= MAX_CODES_PER_ADDRESS_PER_DAY || sentInChat >= MAX_CODES_PER_CHAT_PER_HOUR) {
      return {
        handled: true,
        message:
          language === "hi"
            ? "इस समय और verification codes नहीं भेजे जा सकते. कृपया बाद में फिर प्रयास करें."
            : "No more verification codes can be sent just now. Please try again later.",
        eventType: "employee_otp_limited",
        metadata: { employeeName: pending.employeeName, requesterEmail: email },
      };
    }

    const code = createOtp();
    try {
      await sendOtpEmail(email, code);
    } catch (error) {
      console.error("[EmployeeDirectory] OTP email failed:", error);
      return {
        handled: true,
        message:
          language === "hi"
            ? "मुझे आपकी RDC email ID मिल गई, लेकिन verification email service अभी configured नहीं है. कृपया administrator से noreply@rdc.in SMTP app password set करने को कहें."
            : "I found your RDC email ID, but the verification email service is not configured yet. Please ask the administrator to set the noreply@rdc.in SMTP app password.",
        eventType: "employee_otp_email_failed",
        metadata: { employeeName: pending.employeeName, requesterEmail: email },
      };
    }
    await prisma.employeeOtp.update({
      where: { id: pending.id },
      data: {
        email,
        codeHash: hashCode(code),
        attempts: 0,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return {
      handled: true,
      message:
        language === "hi"
          ? `मैंने ${email} पर 6-digit verification code भेज दिया है. Employee information देखने के लिए कृपया code यहां enter करें. यह verification इस chat में ${MAX_EMPLOYEE_LOOKUPS_PER_CODE} employees तक lookup करने के लिए use हो सकता है.`
          : `I have sent a 6-digit verification code to ${email}. Please enter the code here to view the employee information. One verification can be used for up to ${MAX_EMPLOYEE_LOOKUPS_PER_CODE} employee lookups in this chat.`,
      eventType: "employee_otp_sent",
      metadata: { employeeName: pending.employeeName, requesterEmail: email },
    };
  }

  // A lookup starts from an explicit request ("tell me about …", "who is …") or
  // from a message that is just a name, and until this chat is verified it
  // always asks for verification first, whether or not the name is real. (A
  // bare name was once checked against the directory BEFORE verification, and
  // only real employees got the prompt — so anyone could learn who works at
  // RDC by typing names.) Once verified, a single first name is enough.
  const activeAuth = await latestActiveVerifiedEmployeeAuth(sessionId);
  const explicitName = extractEmployeeName(message);
  const employeeName = explicitName || bareEmployeeName(message, Boolean(activeAuth));
  if (!employeeName) return { handled: false };

  if (activeAuth) {
    const lookupCount = await employeeLookupCountForCode(activeAuth);
    if (lookupCount < MAX_EMPLOYEE_LOOKUPS_PER_CODE) {
      await recordVerifiedEmployeeLookup(activeAuth, employeeName);
      const employee = await findEmployee(employeeName);
      return {
        handled: true,
        message: formatEmployee(employee, language),
        eventType: "employee_lookup_completed",
        metadata: {
          employeeName,
          requesterEmail: activeAuth.email,
          found: Boolean(employee),
          reusedVerification: true,
          remainingLookups: Math.max(0, MAX_EMPLOYEE_LOOKUPS_PER_CODE - lookupCount - 1),
        },
      };
    }
  }

  await prisma.employeeOtp.create({
    data: {
      sessionId,
      employeeName,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // A bare "name" might be a place or product this list does not know:
  // say how to ask something else instead.
  const otherwise = explicitName ? "" : language === "hi"
    ? ` अगर आप कुछ और पूछना चाहते थे, तो कृपया पूरा सवाल लिखें.`
    : ` If you meant something else, please ask it as a full question.`;
  return {
    handled: true,
    message: employeePrompt(employeeName, language) + otherwise,
    eventType: "employee_lookup_requested",
    metadata: { employeeName, bareName: !explicitName },
  };
}
