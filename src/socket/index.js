// // src/socket/index.js
// const socketIO = require("socket.io");
// const jwt = require("jsonwebtoken");
// const { User } = require("../models/User.model");
// const { Channel } = require("../models/Channel.model");
// const { Message } = require("../models/Message.model");

// let io = null;
// const userSockets = new Map();
// const channelRooms = new Map();

// const initializeSocket = (server) => {
//   console.log("🔌 Initializing Socket.io server...");

//   const allowedOrigins = [
//     "http://localhost:3000",
//     "http://localhost:3001",
//     "http://localhost:5000",
//     "https://taskify-frontend-alpha.vercel.app",
//     "https://taskify-server-5gat.onrender.com",
//     process.env.FRONTEND_URL,
//   ].filter(Boolean);

//   io = socketIO(server, {
//     cors: {
//       origin: (origin, callback) => {
//         if (!origin || allowedOrigins.includes(origin)) {
//           callback(null, true);
//         } else {
//           console.warn(`⚠️ Socket CORS rejected origin: ${origin}`);
//           callback(new Error(`Origin ${origin} not allowed by CORS`));
//         }
//       },
//       credentials: true,
//       methods: ["GET", "POST"],
//       allowedHeaders: ["Authorization"],
//     },
//     transports: ["websocket", "polling"],
//   });

//   // ============================================================
//   // AUTHENTICATION MIDDLEWARE
//   // ============================================================
//   io.use(async (socket, next) => {
//     try {
//       let token =
//         socket.handshake.auth?.token ||
//         socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
//         socket.handshake.query?.token;

//       if (!token && socket.handshake.headers?.cookie) {
//         const match = socket.handshake.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
//         if (match) token = match[1];
//       }

//       if (!token) {
//         console.warn("❌ Socket rejected: No token found from", socket.id);
//         return next(new Error("Authentication error: Token missing"));
//       }

//       const decoded = jwt.verify(token, process.env.JWT_SECRET);
//       const user = await User.findById(decoded.userId).select("-password");

//       if (!user || !user.isActive) {
//         console.warn(`❌ Socket rejected: User ${decoded.userId} inactive`);
//         return next(new Error("Authentication error: User inactive"));
//       }

//       socket.user = user;
//       socket.userId = user._id.toString();
//       console.log(`🔑 Socket verified: ${user.fullName} (${socket.userId})`);
//       next();
//     } catch (error) {
//       console.error("❌ Socket auth error:", error.message);
//       next(new Error(`Authentication error: ${error.message}`));
//     }
//   });

//   // ============================================================
//   // CONNECTION HANDLER
//   // ============================================================
//   io.on("connection", async (socket) => {
//     const userId = socket.userId;
//     console.log(`🔌 [CONNECT] User online: ${socket.user?.fullName} | Socket ID: ${socket.id}`);

//     userSockets.set(userId, socket.id);
//     socket.join(`user-${userId}`);

//     // Auto-join all existing channels
//     try {
//       const userChannels = await Channel.find({
//         "members.userId": userId,
//         isArchived: false,
//       }).select("_id");

//       userChannels.forEach((ch) => {
//         const roomId = `channel-${ch._id.toString()}`;
//         socket.join(roomId);
//         if (!channelRooms.has(ch._id.toString())) {
//           channelRooms.set(ch._id.toString(), new Set());
//         }
//         channelRooms.get(ch._id.toString()).add(userId);
//       });

//       console.log(`📡 Auto-subscribed ${socket.user?.fullName} to ${userChannels.length} channel rooms`);
//     } catch (error) {
//       console.error("Error auto-joining rooms:", error);
//     }

//     io.emit("user:online", { userId });

//     // ============================================================
//     // CHANNEL JOIN
//     // ============================================================
//     socket.on("channel:join", async (data) => {
//       try {
//         const rawId = typeof data === "object" ? data.channelId : data;
//         if (!rawId) return;

//         const cleanChannelId = rawId.toString().trim();
//         const roomId = `channel-${cleanChannelId}`;

//         // Verify user is a member
//         const channel = await Channel.findOne({
//           _id: cleanChannelId,
//           "members.userId": userId,
//           isArchived: false,
//         });

//         if (!channel) {
//           return socket.emit("error", { message: "Channel not found or you're not a member" });
//         }

//         socket.join(roomId);
//         if (!channelRooms.has(cleanChannelId)) {
//           channelRooms.set(cleanChannelId, new Set());
//         }
//         channelRooms.get(cleanChannelId).add(userId);

//         console.log(`✅ ${socket.user?.fullName} joined ${roomId}`);
//         socket.emit("channel:joined", { channelId: cleanChannelId, success: true });
//       } catch (error) {
//         console.error("Error on channel:join:", error);
//         socket.emit("error", { message: error.message });
//       }
//     });

//     // ============================================================
//     // CHANNEL LEAVE
//     // ============================================================
//     socket.on("channel:leave", (data) => {
//       try {
//         const rawId = typeof data === "object" ? data.channelId : data;
//         if (!rawId) return;

//         const cleanChannelId = rawId.toString().trim();
//         const roomId = `channel-${cleanChannelId}`;

//         socket.leave(roomId);
//         if (channelRooms.has(cleanChannelId)) {
//           channelRooms.get(cleanChannelId).delete(userId);
//         }

//         console.log(`🚪 ${socket.user?.fullName} left ${roomId}`);
//         socket.emit("channel:left", { channelId: cleanChannelId, success: true });
//       } catch (error) {
//         console.error("Error on channel:leave:", error);
//       }
//     });

//     // ============================================================
//     // CHANNEL READ
//     // ============================================================
//     socket.on("channel:read", async (data) => {
//       try {
//         const rawId = typeof data === "object" ? data.channelId : data;
//         if (!rawId) return;

//         const cleanChannelId = rawId.toString().trim();

//         const result = await Message.updateMany(
//           {
//             channelId: cleanChannelId,
//             "readBy.userId": { $ne: userId },
//             senderId: { $ne: userId },
//           },
//           {
//             $addToSet: {
//               readBy: {
//                 userId: userId,
//                 readAt: new Date(),
//               },
//             },
//           }
//         );

//         socket.emit("channel:read", { channelId: cleanChannelId, success: true, updated: result.modifiedCount });
//       } catch (error) {
//         console.error("Error on channel:read:", error);
//       }
//     });

//     // ============================================================
//     // MESSAGE SEND (Direct Socket Path)
//     // ============================================================
//     socket.on("message:send", async (data) => {
//       try {
//         const { channelId, ...messageData } = data;
//         if (!channelId) return;

//         const cleanChannelId = channelId.toString().trim();

//         // Verify channel exists and user is a member
//         const channel = await Channel.findOne({
//           _id: cleanChannelId,
//           "members.userId": userId,
//           isArchived: false,
//         });

//         if (!channel) {
//           return socket.emit("error", { message: "Channel not found or you're not a member" });
//         }

//         let message;

//         if (messageData._id) {
//           // Existing message (edit/update)
//           message = await Message.findById(messageData._id)
//             .populate("senderId", "fullName email avatar")
//             .populate("replyTo", "content senderId")
//             .populate("mentions.userId", "fullName email");
//         } else {
//           // New message
//           const newMessage = new Message({
//             channelId: cleanChannelId,
//             senderId: userId,
//             content: messageData.content || "",
//             type: messageData.type || "text",
//             attachments: messageData.attachments || [],
//             linkedTaskId: messageData.linkedTaskId || null,
//             replyTo: messageData.replyTo || null,
//             mentions: messageData.mentions || [],
//           });

//           await newMessage.save();

//           message = await Message.findById(newMessage._id)
//             .populate("senderId", "fullName email avatar")
//             .populate("replyTo", "content senderId")
//             .populate("mentions.userId", "fullName email");
//         }

//         if (!message) return;

//         // Update channel last message
//         await Channel.findByIdAndUpdate(cleanChannelId, {
//           lastMessage: message._id,
//           updatedAt: new Date(),
//         });

//         const roomId = `channel-${cleanChannelId}`;
//         console.log(`📡 [SOCKET] Emitting message:new to ${roomId}`);

//         // Broadcast to all in channel room
//         io.to(roomId).emit("message:new", {
//           channelId: cleanChannelId,
//           message: message,
//           userId: userId,
//         });

//         // Handle mentions
//         if (message.mentions && message.mentions.length > 0) {
//           for (const mention of message.mentions) {
//             const targetUserId = mention.userId?._id?.toString() || mention.userId?.toString();
//             if (targetUserId && targetUserId !== userId) {
//               io.to(`user-${targetUserId}`).emit("notification:new", {
//                 type: "mention",
//                 title: `Mention in #${channel.name}`,
//                 message: `${socket.user.fullName} mentioned you`,
//                 data: { channelId: cleanChannelId, messageId: message._id },
//               });
//             }
//           }
//         }
//       } catch (error) {
//         console.error("Error on message:send:", error);
//         socket.emit("error", { message: error.message });
//       }
//     });

//     // ============================================================
//     // TYPING INDICATORS
//     // ============================================================
//     socket.on("typing:start", (data) => {
//       const rawId = typeof data === "object" ? data.channelId : data;
//       if (!rawId) return;
//       const cleanId = rawId.toString().trim();

//       socket.to(`channel-${cleanId}`).emit("typing:start", {
//         channelId: cleanId,
//         userId: socket.userId,
//         userName: socket.user.fullName,
//       });
//     });

//     socket.on("typing:stop", (data) => {
//       const rawId = typeof data === "object" ? data.channelId : data;
//       if (!rawId) return;
//       const cleanId = rawId.toString().trim();

//       socket.to(`channel-${cleanId}`).emit("typing:stop", {
//         channelId: cleanId,
//         userId: socket.userId,
//       });
//     });

//     // ============================================================
//     // REACTIONS
//     // ============================================================
//     socket.on("message:reaction", async (data) => {
//       try {
//         const { messageId, emoji } = data;
//         if (!messageId || !emoji) return;

//         const message = await Message.findById(messageId);
//         if (!message) return socket.emit("error", { message: "Message not found" });

//         const existingIndex = message.reactions.findIndex(
//           (r) => r.userId.toString() === userId && r.emoji === emoji
//         );

//         if (existingIndex > -1) {
//           message.reactions.splice(existingIndex, 1);
//         } else {
//           message.reactions.push({ userId, emoji });
//         }

//         await message.save();

//         io.to(`channel-${message.channelId.toString()}`).emit("message:reaction", {
//           channelId: message.channelId.toString(),
//           messageId: message._id.toString(),
//           reactions: message.reactions,
//         });
//       } catch (error) {
//         console.error("Error on message:reaction:", error);
//       }
//     });

//     // ============================================================
//     // MESSAGE DELETE
//     // ============================================================
//     socket.on("message:delete", async (data) => {
//       try {
//         const { messageId } = data;
//         const message = await Message.findById(messageId);
//         if (!message) return;

//         const channel = await Channel.findById(message.channelId);
//         const userMember = channel?.members.find((m) => m.userId.toString() === userId);
//         const isAdmin = userMember?.role === "admin";
//         const isSender = message.senderId.toString() === userId;

//         if (!isSender && !isAdmin) {
//           return socket.emit("error", { message: "Permission denied" });
//         }

//         message.isDeleted = true;
//         await message.save();

//         io.to(`channel-${message.channelId.toString()}`).emit("message:deleted", {
//           channelId: message.channelId.toString(),
//           messageId: message._id.toString(),
//         });
//       } catch (error) {
//         console.error("Error on message:delete:", error);
//       }
//     });

//     // ============================================================
//     // MESSAGE EDIT
//     // ============================================================
//     socket.on("message:edit", async (data) => {
//       try {
//         const { messageId, content } = data;
//         const message = await Message.findById(messageId);
//         if (!message || message.senderId.toString() !== userId) return;

//         message.content = content.trim();
//         message.isEdited = true;
//         await message.save();

//         const populatedMessage = await Message.findById(message._id)
//           .populate("senderId", "fullName email avatar")
//           .populate("replyTo", "content senderId");

//         io.to(`channel-${message.channelId.toString()}`).emit("message:updated", {
//           channelId: message.channelId.toString(),
//           message: populatedMessage,
//         });
//       } catch (error) {
//         console.error("Error on message:edit:", error);
//       }
//     });

//     // ============================================================
//     // DISCONNECT
//     // ============================================================
//     socket.on("disconnect", () => {
//       console.log(`🔌 [DISCONNECT] ${socket.user?.fullName} (${userId})`);
//       userSockets.delete(userId);

//       for (const [channelId, users] of channelRooms) {
//         if (users.has(userId)) {
//           users.delete(userId);
//         }
//       }

//       io.emit("user:offline", { userId });
//     });
//   });

//   return io;
// };

// // ============================================================
// // EXPORTS
// // ============================================================
// module.exports = {
//   initializeSocket,
//   getIO: () => io,
//   emitToChannel: (channelId, event, data) => {
//     if (io && channelId) {
//       const roomId = `channel-${channelId.toString().trim()}`;
//       console.log(`📡 [HELPER] ${event} → ${roomId}`);
//       io.to(roomId).emit(event, data);
//     }
//   },
//   emitToUser: (userId, event, data) => {
//     if (io && userId) {
//       io.to(`user-${userId.toString().trim()}`).emit(event, data);
//     }
//   },
//   emitToAll: (event, data) => {
//     if (io) {
//       io.emit(event, data);
//     }
//   },
//   userSockets,
//   channelRooms,
// };


// src/socket/index.js
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const { User } = require("../models/User.model");
const { Channel } = require("../models/Channel.model");
const { Message } = require("../models/Message.model");

let io = null;
const userSockets = new Map();
const channelRooms = new Map();

const initializeSocket = (server) => {
  console.log("🔌 Initializing Socket.io server...");

  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5000",
    "https://taskify-frontend-alpha.vercel.app",
    "https://taskify-server-5gat.onrender.com",
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  io = socketIO(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.warn(`⚠️ Socket CORS rejected origin: ${origin}`);
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["Authorization"],
    },
    transports: ["websocket", "polling"],
  });

  // ============================================================
  // AUTHENTICATION MIDDLEWARE
  // ============================================================
  io.use(async (socket, next) => {
    try {
      let token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
        socket.handshake.query?.token;

      if (!token && socket.handshake.headers?.cookie) {
        const match = socket.handshake.headers.cookie.match(
          /(?:^|;\s*)token=([^;]+)/,
        );
        if (match) token = match[1];
      }

      if (!token) {
        console.warn("❌ Socket rejected: No token found from", socket.id);
        return next(new Error("Authentication error: Token missing"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // ✅ FIX: support both "userId" (login) and "id" (signup)
      const userId = decoded.userId || decoded.id;

      if (!userId) {
        console.warn("❌ Socket rejected: token missing user id");
        return next(new Error("Authentication error: Invalid token payload"));
      }

      const user = await User.findById(userId).select("-password");

      if (!user) {
        console.warn(`❌ Socket rejected: user ${userId} not found`);
        return next(new Error("Authentication error: User not found"));
      }

      if (!user.isActive) {
        console.warn(`❌ Socket rejected: user ${user._id} inactive`);
        return next(new Error("Authentication error: User inactive"));
      }

      socket.user = user;
      socket.userId = user._id.toString();
      console.log(`🔑 Socket verified: ${user.fullName} (${socket.userId})`);
      next();
    } catch (error) {
      console.error("❌ Socket auth error:", error.message);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  // ============================================================
  // CONNECTION HANDLER
  // ============================================================
  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(
      `🔌 [CONNECT] User online: ${socket.user?.fullName} | Socket ID: ${socket.id}`,
    );

    userSockets.set(userId, socket.id);
    socket.join(`user-${userId}`);

    // Auto-join all existing channels
    try {
      const userChannels = await Channel.find({
        "members.userId": userId,
        isArchived: false,
      }).select("_id");

      userChannels.forEach((ch) => {
        const roomId = `channel-${ch._id.toString()}`;
        socket.join(roomId);
        if (!channelRooms.has(ch._id.toString())) {
          channelRooms.set(ch._id.toString(), new Set());
        }
        channelRooms.get(ch._id.toString()).add(userId);
      });

      console.log(
        `📡 Auto-subscribed ${socket.user?.fullName} to ${userChannels.length} channel rooms`,
      );
    } catch (error) {
      console.error("Error auto-joining rooms:", error);
    }

    io.emit("user:online", { userId });

    // ============================================================
    // CHANNEL JOIN
    // ============================================================
    socket.on("channel:join", async (data) => {
      try {
        const rawId = typeof data === "object" ? data.channelId : data;
        if (!rawId) return;

        const cleanChannelId = rawId.toString().trim();
        const roomId = `channel-${cleanChannelId}`;

        const channel = await Channel.findOne({
          _id: cleanChannelId,
          "members.userId": userId,
          isArchived: false,
        });

        if (!channel) {
          return socket.emit("error", {
            message: "Channel not found or you're not a member",
          });
        }

        socket.join(roomId);
        if (!channelRooms.has(cleanChannelId)) {
          channelRooms.set(cleanChannelId, new Set());
        }
        channelRooms.get(cleanChannelId).add(userId);

        console.log(`✅ ${socket.user?.fullName} joined ${roomId}`);
        socket.emit("channel:joined", {
          channelId: cleanChannelId,
          success: true,
        });
      } catch (error) {
        console.error("Error on channel:join:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // ============================================================
    // CHANNEL LEAVE
    // ============================================================
    socket.on("channel:leave", (data) => {
      try {
        const rawId = typeof data === "object" ? data.channelId : data;
        if (!rawId) return;

        const cleanChannelId = rawId.toString().trim();
        const roomId = `channel-${cleanChannelId}`;

        socket.leave(roomId);
        if (channelRooms.has(cleanChannelId)) {
          channelRooms.get(cleanChannelId).delete(userId);
        }

        console.log(`🚪 ${socket.user?.fullName} left ${roomId}`);
        socket.emit("channel:left", {
          channelId: cleanChannelId,
          success: true,
        });
      } catch (error) {
        console.error("Error on channel:leave:", error);
      }
    });

    // ============================================================
    // CHANNEL READ
    // ============================================================
    socket.on("channel:read", async (data) => {
      try {
        const rawId = typeof data === "object" ? data.channelId : data;
        if (!rawId) return;

        const cleanChannelId = rawId.toString().trim();

        const result = await Message.updateMany(
          {
            channelId: cleanChannelId,
            "readBy.userId": { $ne: userId },
            senderId: { $ne: userId },
          },
          {
            $addToSet: {
              readBy: {
                userId: userId,
                readAt: new Date(),
              },
            },
          },
        );

        socket.emit("channel:read", {
          channelId: cleanChannelId,
          success: true,
          updated: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error on channel:read:", error);
      }
    });

    // ============================================================
    // MESSAGE SEND (Direct Socket Path)
    // ============================================================
    socket.on("message:send", async (data) => {
      try {
        const { channelId, ...messageData } = data;
        if (!channelId) return;

        const cleanChannelId = channelId.toString().trim();

        const channel = await Channel.findOne({
          _id: cleanChannelId,
          "members.userId": userId,
          isArchived: false,
        });

        if (!channel) {
          return socket.emit("error", {
            message: "Channel not found or you're not a member",
          });
        }

        let message;

        if (messageData._id) {
          message = await Message.findById(messageData._id)
            .populate("senderId", "fullName email avatar")
            .populate("replyTo", "content senderId")
            .populate("mentions.userId", "fullName email");
        } else {
          const newMessage = new Message({
            channelId: cleanChannelId,
            senderId: userId,
            content: messageData.content || "",
            type: messageData.type || "text",
            attachments: messageData.attachments || [],
            linkedTaskId: messageData.linkedTaskId || null,
            replyTo: messageData.replyTo || null,
            mentions: messageData.mentions || [],
          });

          await newMessage.save();

          message = await Message.findById(newMessage._id)
            .populate("senderId", "fullName email avatar")
            .populate("replyTo", "content senderId")
            .populate("mentions.userId", "fullName email");
        }

        if (!message) return;

        await Channel.findByIdAndUpdate(cleanChannelId, {
          lastMessage: message._id,
          updatedAt: new Date(),
        });

        const roomId = `channel-${cleanChannelId}`;
        console.log(`📡 [SOCKET] Emitting message:new to ${roomId}`);

        io.to(roomId).emit("message:new", {
          channelId: cleanChannelId,
          message: message,
          userId: userId,
        });

        if (message.mentions && message.mentions.length > 0) {
          for (const mention of message.mentions) {
            const targetUserId =
              mention.userId?._id?.toString() || mention.userId?.toString();
            if (targetUserId && targetUserId !== userId) {
              io.to(`user-${targetUserId}`).emit("notification:new", {
                type: "mention",
                title: `Mention in #${channel.name}`,
                message: `${socket.user.fullName} mentioned you`,
                data: { channelId: cleanChannelId, messageId: message._id },
              });
            }
          }
        }
      } catch (error) {
        console.error("Error on message:send:", error);
        socket.emit("error", { message: error.message });
      }
    });

    // ============================================================
    // TYPING INDICATORS
    // ============================================================
    socket.on("typing:start", (data) => {
      const rawId = typeof data === "object" ? data.channelId : data;
      if (!rawId) return;
      const cleanId = rawId.toString().trim();

      socket.to(`channel-${cleanId}`).emit("typing:start", {
        channelId: cleanId,
        userId: socket.userId,
        userName: socket.user.fullName,
      });
    });

    socket.on("typing:stop", (data) => {
      const rawId = typeof data === "object" ? data.channelId : data;
      if (!rawId) return;
      const cleanId = rawId.toString().trim();

      socket.to(`channel-${cleanId}`).emit("typing:stop", {
        channelId: cleanId,
        userId: socket.userId,
      });
    });

    // ============================================================
    // REACTIONS
    // ============================================================
    socket.on("message:reaction", async (data) => {
      try {
        const { messageId, emoji } = data;
        if (!messageId || !emoji) return;

        const message = await Message.findById(messageId);
        if (!message)
          return socket.emit("error", { message: "Message not found" });

        const existingIndex = message.reactions.findIndex(
          (r) => r.userId.toString() === userId && r.emoji === emoji,
        );

        if (existingIndex > -1) {
          message.reactions.splice(existingIndex, 1);
        } else {
          message.reactions.push({ userId, emoji });
        }

        await message.save();

        io.to(`channel-${message.channelId.toString()}`).emit(
          "message:reaction",
          {
            channelId: message.channelId.toString(),
            messageId: message._id.toString(),
            reactions: message.reactions,
          },
        );
      } catch (error) {
        console.error("Error on message:reaction:", error);
      }
    });

    // ============================================================
    // MESSAGE DELETE
    // ============================================================
    socket.on("message:delete", async (data) => {
      try {
        const { messageId } = data;
        const message = await Message.findById(messageId);
        if (!message) return;

        const channel = await Channel.findById(message.channelId);
        const userMember = channel?.members.find(
          (m) => m.userId.toString() === userId,
        );
        const isAdmin = userMember?.role === "admin";
        const isSender = message.senderId.toString() === userId;

        if (!isSender && !isAdmin) {
          return socket.emit("error", { message: "Permission denied" });
        }

        message.isDeleted = true;
        await message.save();

        io.to(`channel-${message.channelId.toString()}`).emit(
          "message:deleted",
          {
            channelId: message.channelId.toString(),
            messageId: message._id.toString(),
          },
        );
      } catch (error) {
        console.error("Error on message:delete:", error);
      }
    });

    // ============================================================
    // MESSAGE EDIT
    // ============================================================
    socket.on("message:edit", async (data) => {
      try {
        const { messageId, content } = data;
        const message = await Message.findById(messageId);
        if (!message || message.senderId.toString() !== userId) return;

        message.content = content.trim();
        message.isEdited = true;
        await message.save();

        const populatedMessage = await Message.findById(message._id)
          .populate("senderId", "fullName email avatar")
          .populate("replyTo", "content senderId");

        io.to(`channel-${message.channelId.toString()}`).emit(
          "message:updated",
          {
            channelId: message.channelId.toString(),
            message: populatedMessage,
          },
        );
      } catch (error) {
        console.error("Error on message:edit:", error);
      }
    });

    // ============================================================
    // TENDER CHAT — join / leave rooms
    // ============================================================
    socket.on("tender:chat:join", (tenderId) => {
      try {
        if (!tenderId) return;
        const roomId = `tender:${String(tenderId).trim()}`;
        socket.join(roomId);
        console.log(`✅ ${socket.user?.fullName} joined ${roomId}`);
      } catch (error) {
        console.error("Error on tender:chat:join:", error);
      }
    });

    socket.on("tender:chat:leave", (tenderId) => {
      try {
        if (!tenderId) return;
        const roomId = `tender:${String(tenderId).trim()}`;
        socket.leave(roomId);
        console.log(`🚪 ${socket.user?.fullName} left ${roomId}`);
      } catch (error) {
        console.error("Error on tender:chat:leave:", error);
      }
    });

    // Global inbox channel — one room for the whole support inbox page
    socket.on("tender:chat:inbox:join", () => {
      socket.join("tender:chat:inbox");
    });
    socket.on("tender:chat:inbox:leave", () => {
      socket.leave("tender:chat:inbox");
    });

    // ============================================================
    // DISCONNECT
    // ============================================================
    socket.on("disconnect", () => {
      console.log(`🔌 [DISCONNECT] ${socket.user?.fullName} (${userId})`);
      userSockets.delete(userId);

      for (const [channelId, users] of channelRooms) {
        if (users.has(userId)) {
          users.delete(userId);
        }
      }

      io.emit("user:offline", { userId });
    });
  });

  return io;
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  initializeSocket,
  getIO: () => io,
  emitToChannel: (channelId, event, data) => {
    if (io && channelId) {
      const roomId = `channel-${channelId.toString().trim()}`;
      console.log(`📡 [HELPER] ${event} → ${roomId}`);
      io.to(roomId).emit(event, data);
    }
  },
  emitToUser: (userId, event, data) => {
    if (io && userId) {
      io.to(`user-${userId.toString().trim()}`).emit(event, data);
    }
  },
  emitToAll: (event, data) => {
    if (io) {
      io.emit(event, data);
    }
  },
  // NEW — tender chat broadcast
  emitToTender: (tenderId, event, data) => {
    if (io && tenderId) {
      const roomId = `tender:${String(tenderId).trim()}`;
      io.to(roomId).emit(event, data);
      io.to("tender:chat:inbox").emit(event, data);
    }
  },
  userSockets,
  channelRooms,
};