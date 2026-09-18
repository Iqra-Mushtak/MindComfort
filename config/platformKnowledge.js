const knowledgeBase = [
  {
    topic: "purchasing_models_and_access",
    keywords: ["price", "pricing", "plan", "cost", "fee", "buy", "purchase", "subscription", "ticket", "pay", "pkr", "rate", "tier", "package"],
    content: `MindComfort Purchasing & Access Structure:
All subscriptions and passes are billed in PKR. Because administrators can dynamically create, edit, or adjust pricing tiers from the Admin Dashboard, clients should always check their dashboard "Plans" tab for the latest live rates.

Access is categorized into four distinct purchase models:
1. Only Chat Access: Subscription plans granting unlimited entry to all topic-based anonymous community chatrooms.
2. Only All Podcasts Access: Subscription plans granting unlimited live listening access to all scheduled mentor audio podcasts.
3. Both Access (Combo): Comprehensive subscription plans granting full access to both anonymous community chatrooms and all live mentor podcasts.
4. Single Podcast Ticket: One-off individual ticket purchase for a specific scheduled live audio session (mentors may host community awareness sessions for 0 PKR/free, while specialized live sessions are individually priced).

* Note on AI Companion: The 24/7 AI Coping Companion is 100% free and always accessible to all registered clients without requiring any subscription.`
  },
  {
    topic: "chatrooms_and_anonymity",
    keywords: ["chatroom", "chat", "anonymous", "identity", "mask", "room", "peer", "safe", "privacy"],
    content: `Community Chatrooms & Anonymity:
Topic-based chatrooms provide safe peer-to-peer discussion spaces guided by verified mentors.
- Anonymity Guarantee: To remove social stigma and judgment, client real names, emails, and profiles are completely hidden inside chatrooms.
- Dynamic Masking: The system automatically generates a temporary anonymous identifier (UUID) upon joining each session.
- Access Rule: Joining active chatrooms requires an active Chat Subscription or a Both/Combo Subscription plan. Real identities are only visible to staff in administrative audit logs.`
  },
  {
    topic: "live_audio_podcasts",
    keywords: ["podcast", "audio", "listen", "stream", "agora", "live", "mentor", "broadcast", "comment"],
    content: `Live Audio Podcasts:
Verified mentors host real-time interactive audio broadcasts powered by Agora RTC.
- Interactive Feedback: Listeners can send private real-time text comments directly to the mentor during the live broadcast.
- Access Rule: Clients can join live broadcasts either through an active Podcast Subscription, a Both/Combo Subscription, or by purchasing an individual single podcast ticket.`
  },
  {
    topic: "mentors_and_verification",
    keywords: ["mentor", "therapist", "psychologist", "doctor", "counselor", "specialist", "verify", "qualifications"],
    content: `Mentors & Professional Standards:
Mentors on MindComfort are vetted professionals holding qualifications in psychology or counseling (e.g., Master's in Psychology or ADCP).
- Mentor Applications: All applicants submit educational degrees and CNIC documents for strict administrative review and interview before activation.
- Role: Mentors host live podcasts, guide community chatrooms, and provide empathetic, non-judgmental support.`
  },
  {
    topic: "platform_safety_and_moderation",
    keywords: ["moderator", "admin", "report", "rules", "suspend", "warn", "guidelines", "safe"],
    content: `Platform Safety & Moderation:
MindComfort maintains strict community guidelines to ensure a stigma-free, supportive environment.
- Reporting: Users can flag abusive or inappropriate messages in chatrooms and podcast comments.
- Staff Actions: Dedicated moderators and administrators monitor live feeds and review reported items to issue warnings, delete violating messages, or suspend abusive accounts.`
  },
  {
    topic: "crisis_safety_directive",
    keywords: ["suicide", "harm", "kill", "die", "emergency", "hurt myself", "cut", "end it"],
    content: `CRITICAL SAFETY DIRECTIVE:
MindComfort is an emotional support, mental wellness, and catharsis platform; it is NOT an emergency hospital, clinical psychiatric unit, or crisis hotline. If you or someone you know is in acute danger, experiencing severe clinical distress, or having thoughts of self-harm or suicide, please contact local emergency medical services or call the Pakistan Mental Health Helpline at 1166 immediately.`
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