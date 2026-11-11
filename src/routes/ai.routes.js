// routes/ai.routes.js
const express = require("express");
const { authenticate } = require("../middleware/auth.middleware");
const {
  getChatHistory,
  createChat,
  sendMessageStream,
  pinChat,
  deleteChat,
  renameChat,
} = require("../controllers/ai.controller");

const router = express.Router();

router.use(authenticate);

router.get("/chats", getChatHistory);
router.post("/chats", createChat);
router.put("/chats/:id/pin", pinChat);
router.put("/chats/:id/rename", renameChat);
router.delete("/chats/:id", deleteChat);
router.post("/chats/:id/message-stream", sendMessageStream);

module.exports = router;
