// controllers/ai.controller.js
const AIService = require("../services/ai.service");
const { AIChat } = require("../models/AIChat.model");
const mongoose = require("mongoose");

const getChatHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await AIChat.find({ userId })
      .sort({ isPinned: -1, updatedAt: -1 })
      .select("_id title messages createdAt updatedAt isPinned model");
    res.json({ success: true, data: chats });
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const createChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title = "New Conversation" } = req.body;

    const chat = await AIChat.create({
      userId,
      title,
      messages: [],
      model: process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash",
    });

    res.json({ success: true, data: chat });
  } catch (error) {
    console.error("Create chat error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const sendMessageStream = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    if (!message) {
      return res
        .status(400)
        .json({ success: false, message: "Message is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid chat ID" });
    }

    let chat = await AIChat.findOne({ _id: id, userId });
    if (!chat) {
      chat = await AIChat.create({
        userId,
        title: message.substring(0, 50),
        messages: [],
        model: process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash",
      });
    }

    chat.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });
    await chat.save();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullText = "";
    let sources = [];

    await AIService.generateStream(
      message,
      (chunk) => {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      },
      async (finalText, finalSources) => {
        sources = finalSources || [];

        chat.messages.push({
          role: "assistant",
          content: fullText,
          sources: sources,
          model: process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash",
          timestamp: new Date(),
        });
        chat.model = process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash";
        chat.lastMessageAt = new Date();
        chat.title =
          chat.messages.length <= 2 ? message.substring(0, 50) : chat.title;
        await chat.save();

        res.write(
          `data: ${JSON.stringify({
            done: true,
            sources,
            model: process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash",
            chatId: chat._id,
          })}\n\n`,
        );
        res.end();
      },
    );
  } catch (error) {
    console.error("Stream error:", error);
    res.write(
      `data: ${JSON.stringify({
        error: error.message || "Server error",
        done: true,
      })}\n\n`,
    );
    res.end();
  }
};

const pinChat = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid chat ID" });
    }

    const chat = await AIChat.findOne({ _id: id, userId });
    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    }

    chat.isPinned = !chat.isPinned;
    await chat.save();

    res.json({ success: true, data: chat });
  } catch (error) {
    console.error("Pin chat error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteChat = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid chat ID" });
    }

    const chat = await AIChat.findOneAndDelete({ _id: id, userId });
    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    }

    res.json({ success: true, message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Delete chat error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const renameChat = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user._id;

    if (!title) {
      return res
        .status(400)
        .json({ success: false, message: "Title is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid chat ID" });
    }

    const chat = await AIChat.findOne({ _id: id, userId });
    if (!chat) {
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    }

    chat.title = title;
    await chat.save();

    res.json({ success: true, data: chat });
  } catch (error) {
    console.error("Rename chat error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getChatHistory,
  createChat,
  sendMessageStream,
  pinChat,
  deleteChat,
  renameChat,
};
