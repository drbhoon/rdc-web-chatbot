# RDC Saathi - Multilingual AI Chatbot

A production-quality localhost-first web application for RDC Concrete. The chatbot ("RDC Saathi") is a welcoming, voice-enabled assistant capable of answering questions about RDC using its internal knowledge base, capturing commercial leads, and automatically handling conversations in multiple languages.

## 🚀 Key Features
- **Modern UI**: Polished, floating website widget.
- **Multilingual Support**: Automatically detects language (Hindi, Marathi, English, etc.) and naturally responds in it. 
- **RAG Architecture**: Uses an internal offline knowledge base of RDC's services, operations, and technical benefits. 
- **Voice Support**: Integrated speech-to-text (mic) and text-to-speech for responses.
- **Lead Capture**: Seamlessly offers a form to capture visitor flow when commercial intent is recognized. 
- **Admin Panel**: Simple dashboard to view analytics, recent sessions, extracted leads, and fallback queries.
- **Multi-Provider AI**: Supports Mock Mode (works offline), Google Gemini, or OpenAI. 

---

## 🛠 Tech Stack
- Frontend & Backend: Next.js (App Router), TypeScript, TailwindCSS
- Database: SQLite via Prisma
- AI Integration: `gemini-2.0-flash` (or OpenAI / Mock Mode)
- Language processing: `franc-min` for language scripting & detection. 
- Search: Optional Tavily external web fallback.

---

## 💻 Getting Started (Localhost)

1. **Install Dependencies** (if you haven't already):
```bash
npm install
```

2. **Setup your environment variables**:
Duplicate `.env.example` (or edit `.env`). 
To use the Gemini API (default active provider for best conversational AI), set:
```bash
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key_here
```
*(If you do not have an API key right now, simply set `USE_MOCK_AI=true` to demonstrate predefined capabilities offline).*

3. **Database and Knowledge Base Seeding**:
For first time setup, ensure your Prisma database is generated, and run the seeder rule to insert the RDC knowledge base chunks:
```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

4. **Start the Frontend Development Server**:
```bash
npm run dev
```

5. **Test the Application End-to-End**:
- Open [http://localhost:3000](http://localhost:3000)
- You will see a demo "RDC Concrete" host website shell.
- Click the glowing pulse launcher on the bottom-right to activate the chatbot widget. 
- Admins can visit [http://localhost:3000/admin](http://localhost:3000/admin) to view the analytics dashboard (Login: `admin@rdcconcrete.com` / Password: `rdcadmin2025`).

---

## 📚 Knowledge File Ingestion

RDC Saathi's facts are embedded locally using static ingestion. Out of the box, we use sample knowledge drawn from RDC presentations.

**To add your own new documents:**
1. Open the `/knowledge/rdc-knowledge.json` file.
2. Put any new concrete, corporate, pricing, or local facts under the `"content"` blocks.
3. Run `npm run seed`. 
4. The chatbot will dynamically start retrieving your updated chunks in the next conversation!

---

## 🔮 Future-Ready Steps (Towards Production)
- **Vector Database**: Currently, `src/lib/knowledge/retrieval.ts` handles MVP TF-IDF keyword-search logic. Later, replace this with a real vector query index such as Pinecone, ChromaDB, or pgvector for semantic density.
- **Database Storage**: Upgrade SQLite schemas configuration in `prisma.schema` to Postgres by modifying the datasource provider string.
- **Third-Party APIs**: Turn on the `TAVILY_API_KEY` in `.env` to enable live Web Search queries if confidence is low. 

Designed by DeepMind team. Enjoy your new Assistant!
