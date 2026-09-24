const Groq = require("groq-sdk");
const Plan = require("../models/Plan");
const Chatroom = require("../models/Chatroom");
const Podcast = require("../models/Podcast");
const Subscription = require("../models/Subscription");
const { retrieveRelevantKnowledge } = require("../config/platformKnowledge");
const User = require("../models/User");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const handleChatbotMessage = async (req, res) => {
  try {
    const { messages: incomingMessages, prompt } = req.body;
    const userId = req.user?.id || req.user?._id;

    const currentUserMessage =
      prompt ||
      (Array.isArray(incomingMessages) && incomingMessages.length > 0
        ? incomingMessages[incomingMessages.length - 1].text
        : "");

    if (!currentUserMessage || !currentUserMessage.trim()) {
      return res.status(400).json({ error: "Message prompt is required" });
    }

    const query = currentUserMessage.toLowerCase();
    let dynamicOperationalContext = "";

    if (/(plan|price|pricing|cost|fee|subscription|pay|pkr|tier)/i.test(query)) {
      try {
        const activePlans = await Plan.find({ isActive: true })
          .select("name type price durationMonths description")
          .sort({ displayOrder: 1, price: 1 })
          .lean();

        if (activePlans.length > 0) {
          dynamicOperationalContext += "\nActive Subscription Plans:\n" +
            activePlans.map(p => `- ${p.name} (${p.type.toUpperCase()}): PKR ${p.price} for ${p.durationMonths} mo`).join("\n");
        }
      } catch (err) {
        console.warn("Operational query failed (Plans):", err.message);
      }
    }

    if (/(mentor|who|list|counselor|therapist|specialist)/i.test(query)) {
      try {
        const mentors = await User.find({ role: 'mentor' })
          .select("fullName username")
          .lean();
        
        if (mentors.length > 0) {
          dynamicOperationalContext += "\nRegistered Mentors:\n" +
            mentors.map(m => `- ${m.fullName || m.username}`).join("\n");
        } else {
          dynamicOperationalContext += "\nRegistered Mentors:\n- No mentors are currently registered on the platform.";
        }
      } catch (err) {
        console.warn("Operational query failed (Mentors):", err.message);
      }
    }

    if (/(room|chatroom|topic|group|community)/i.test(query)) {
      try {
        const activeRooms = await Chatroom.find({ isActive: true })
          .select("name description")
          .limit(6)
          .lean();

        if (activeRooms.length > 0) {
          dynamicOperationalContext += "\nActive Community Chatrooms:\n" +
            activeRooms.map(r => `- ${r.name}: ${r.description || "Open support group"}`).join("\n");
        }
      } catch (err) {
        console.warn("Operational query failed (Chatrooms):", err.message);
      }
    }

    if (/(podcast|session|broadcast|listen|stream|upcoming|schedule)/i.test(query)) {
      try {
        const upcomingPodcasts = await Podcast.find({
          approvalStatus: "approved",
          streamStatus: { $in: ["scheduled", "live"] }
        })
          .populate("speaker", "fullName username")
          .select("title startTime price streamStatus speaker")
          .sort({ startTime: 1 })
          .limit(3)
          .lean();

        if (upcomingPodcasts.length > 0) {
          dynamicOperationalContext += "\nLive & Upcoming Podcasts:\n" +
            upcomingPodcasts.map(p => 
              `- ${p.title} (${p.streamStatus.toUpperCase()}) by ${p.speaker?.fullName || "Mentor"} | Fee: ${p.price === 0 ? "Free" : `PKR ${p.price}`}`
            ).join("\n");
        }
      } catch (err) {
        console.warn("Operational query failed (Podcasts):", err.message);
      }
    }

    if (/(my plan|my subscription|can i join|do i have access|am i subscribed)/i.test(query) && userId) {
      try {
        const userSubs = await Subscription.find({
          userId,
          status: "active",
          $or: [{ endDate: {$gt: new Date() } }, { endDate: null }]
        }).select("type planName endDate").lean();

        if (userSubs.length > 0) {
          dynamicOperationalContext += "\nClient's Active Access:\n" +
            userSubs.map(s => `- Active for: ${s.type.toUpperCase()} (${s.planName})`).join("\n");
        } else {
          dynamicOperationalContext += "\nClient's Active Access:\n- Client currently has NO active subscriptions.";
        }
      } catch (err) {
        console.warn("Operational query failed (User Subscription):", err.message);
      }
    }

    const staticKnowledge = retrieveRelevantKnowledge(currentUserMessage);

    let conversationHistory = [];
    if (Array.isArray(incomingMessages) && incomingMessages.length > 0) {
      const pastMessages = incomingMessages.slice(0, -1);
      conversationHistory = pastMessages
        .filter((m) => m.text && m.text.trim())
        .slice(-6)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        }));
    }

    const systemPrompt = `
You are MindComfort's direct and supportive AI Companion.

Platform Architecture & Available Features:
MindComfort has ONLY two core interactive features and one free tool:
1. Anonymous Community Chatrooms: Mutual group chatrooms where users interact anonymously using dynamic masked IDs.
2. Live Audio Podcasts: Real-time mentor broadcasts with live text feedback from listeners.
3. AI Companion: This free support chat.
4. All payments are processed securely through Stripe, a trusted third-party payment gateway. Users are redirected to Stripe's secure checkout page to complete transactions. Stripe accepts all major credit and debit cards. After successful payment, users are redirected back to MindComfort and their subscription is automatically activated.
5. NO "MindComfort's own payment gateway" - we use Stripe exclusively.

Strict Non-Existent Feature Boundaries (NEVER CLAIM OR SUGGEST THESE):
- Nothing is free beyond the AI Companion chat. All other features require a paid subscription.
- NO 1-on-1 private therapist appointments, bookings, or personal consultations.
- NO 1-on-1 private messaging or calls with mentors.
- NO recorded podcasts, past audio archives, or session replays (all podcasts are strictly live).
- NO mood-tracking tools, mood diaries, or emotional rating scales.
- NO curated resource libraries, articles, or downloadable worksheets.

- If a user asks to book a therapist or schedule a 1-on-1 session, politely clarify that MindComfort does not support private bookings or 1-to-1 consultations, and explain that mentors guide mutual community chatrooms and host live audio broadcasts.
- NEVER invent or hallucinate mentor names. If the "Registered Mentors" list in the Live Platform Data is empty, state clearly that no mentors are currently registered. Only use the exact names provided in the Live Platform Data.

${dynamicOperationalContext ? `Live Platform Data:\n"""${dynamicOperationalContext}\n"""\n` : ""}
${staticKnowledge ? `Platform Documentation:\n"""${staticKnowledge}\n"""\n` : ""}

Strict Output Rules:
1. NEVER start responses with repetitive greetings or phrases like "I'm here for you", "I understand", or "Hello". Start directly with the answer.
2. Plain text only: Do NOT use markdown symbols (no asterisks **, no hashes #) and no numeric emojis.
3. If listing features or points, separate them with short, clear bullet points (-) so it is easy to read.
4. Keep responses concise, clear, and under 4 sentences.
`;

    const chatCompletion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: currentUserMessage },
      ],
      temperature: 0.4,
      max_tokens: 450, 
      top_p: 0.85,
    });

    let reply = chatCompletion.choices[0]?.message?.content || "";

    reply = reply
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/^[0-9]+[️⃣\.\)]\s*/gm, "")
      .trim();

    const lastPunctuation = Math.max(
      reply.lastIndexOf("."),
      reply.lastIndexOf("!"),
      reply.lastIndexOf("?")
    );
    if (lastPunctuation !== -1 && lastPunctuation < reply.length - 1) {
      reply = reply.substring(0, lastPunctuation + 1);
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Chatbot Controller Error:", error);
    return res.status(500).json({
      error: "Our companion is temporarily resting. Please try again shortly.",
    });
  }
};

module.exports = {
  handleChatbotMessage,
};