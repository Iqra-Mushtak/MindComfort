const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { handleChatbotMessage } = require("../controllers/chatbotController");

const requireClientAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    const userRole = (decoded.role || "").toLowerCase();
    if (userRole && userRole !== "client") {
      return res.status(403).json({ error: "Access denied. AI companion is exclusive to Clients." });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session token" });
  }
};

router.post("/message", requireClientAuth, handleChatbotMessage);

module.exports = router;