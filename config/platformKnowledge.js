const knowledgeBase = [
  {
    topic: "platform_core_features_and_boundaries",
    keywords: ["feature", "features", "offer", "what does mindcomfort offer", "service", "services", "functionality", "system", "tools"],
    content: `MindComfort Core Features:
MindComfort exclusively offers three core capabilities:
1. Anonymous Community Chatrooms: Group topic spaces where clients chat anonymously with dynamic masked IDs alongside peers and verified mentors.
2. Live Audio Podcasts: Real-time interactive audio broadcasts hosted by verified mentors using Agora RTC, where listeners can send private live comments.
3. AI Coping Companion: A free 24/7 conversational support assistant for reflection and guidance.

Strict Feature Boundaries (What MindComfort DOES NOT offer):
- NO 1-on-1 private appointments, booking systems, or individual therapy sessions.
- NO 1-on-1 private messaging or individual calls with mentors.
- NO recorded podcasts or session playbacks; all mentor broadcasts are exclusively live.
- NO mood-tracking tools, mood diaries, or daily assessment logs.
- NO curated resource libraries, articles, or downloadable worksheets.
- All mentor interactions occur strictly within public community chatrooms or live podcast broadcasts.`
  },
  {
    topic: "mentors_and_appointments_clarification",
    keywords: ["book", "appointment", "schedule", "therapist", "hire", "individual", "personal", "one on one", "1 on 1", "consultation", "doctor", "session"],
    content: `Booking & 1-on-1 Policy:
MindComfort does NOT offer private appointments, individual therapist bookings, or 1-on-1 sessions.
Mentors on MindComfort do not take personal private clients on the platform. Mentors only facilitate mutual group spaces: hosting live audio podcasts and guiding anonymous group community chatrooms.`
  },
  {
    topic: "purchasing_models_and_access",
    keywords: ["price", "pricing", "plan", "cost", "fee", "buy", "purchase", "subscription", "ticket", "pay", "pkr", "rate", "tier", "package"],
    content: `MindComfort Purchasing & Access Structure:
All plans and passes are billed in PKR. Clients can view active pricing on the Plans tab.
The 4 purchase options are:
1. Only Chat Access: Subscription granting unlimited entry to anonymous community chatrooms.
2. Only All Podcasts Access: Subscription granting unlimited live listening to all scheduled mentor broadcasts.
3. Both Access (Combo): Access to both anonymous chatrooms and all live mentor podcasts.
4. Single Podcast Ticket: Individual pass for a specific scheduled live session (free community awareness sessions cost 0 PKR; paid sessions are priced by the mentor).
* The AI Companion is always 100% free for registered clients.`
  },
  {
    topic: "chatrooms_and_anonymity",
    keywords: ["chatroom", "chat", "anonymous", "identity", "mask", "room", "peer", "safe", "privacy"],
    content: `Community Chatrooms:
Topic-based spaces for mutual peer-to-peer discussion. Clients are assigned dynamic anonymous UUIDs. Chatrooms are strictly group discussions; there is no private 1-to-1 client-to-mentor messaging.`
  },
  {
    topic: "live_audio_podcasts",
    keywords: ["podcast", "audio", "listen", "stream", "agora", "live", "mentor", "broadcast", "comment", "record", "recording"],
    content: `Live Audio Podcasts:
Mentors host real-time interactive audio streams. There are NO recordings or saved replays; all sessions are exclusively live. Listeners can send real-time text feedback to the mentor during the broadcast.`
  },
  {
    topic: "crisis_safety_directive",
    keywords: ["suicide", "harm", "kill", "die", "emergency", "hurt myself", "cut", "end it"],
    content: `CRITICAL SAFETY DIRECTIVE:
MindComfort is for peer support and wellness, not emergency crisis response. If you are in immediate danger or having thoughts of self-harm, please contact emergency services or dial the Pakistan Mental Health Helpline at 1166 immediately.`
  }
];

function retrieveRelevantKnowledge(userQuery) {
  if (!userQuery || typeof userQuery !== "string") return "";
  const query = userQuery.toLowerCase();

  const matchedChunks = knowledgeBase.filter((entry) =>
    entry.keywords.some((keyword) => query.includes(keyword))
  );

  if (matchedChunks.length === 0) {
    return "";
  }

  return matchedChunks.map((chunk) => chunk.content).join("\n\n");
}

module.exports = {
  knowledgeBase,
  retrieveRelevantKnowledge
};