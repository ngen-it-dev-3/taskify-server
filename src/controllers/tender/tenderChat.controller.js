// // src/controllers/tender/tenderChat.controller.js
// const Tender = require("../../models/Tender.model");
// const TenderChatMessage = require("../../models/TenderChatMessage.model");
// const { emitToTender } = require("../../socket");

// /* Who counts as "management"? */
// const MGMT_ROLES = [
//     "super_admin",
//     "admin",
//     "hr_manager",
//     "dept_manager",
//     "project_manager",
// ];

// const isManagement = (user) => MGMT_ROLES.includes(user?.role);

// /* --------------------------------------------------------------
//  * Convert an absolute disk path (req.file.path) into a public
//  * /uploads/... URL.
//  * -------------------------------------------------------------- */
// function toPublicUploadUrl(absPath) {
//     if (!absPath) return "";
//     const normalized = absPath.replace(/\\/g, "/");
//     const idx = normalized.lastIndexOf("/uploads/");
//     if (idx === -1) return "";
//     return normalized.slice(idx);
// }

// function pickKind(mimeType = "") {
//     if (mimeType.startsWith("image/")) return "image";
//     if (mimeType.startsWith("audio/")) return "audio";
//     if (mimeType.startsWith("video/")) return "video";
//     return "file";
// }

// /* --------------------------------------------------------------
//  * LIST messages — GET /api/tenders/:id/chat?after=<ISO>
//  * -------------------------------------------------------------- */
// const listMessages = async (req, res) => {
//     try {
//         const tender = await Tender.findById(req.params.id).lean();
//         if (!tender) {
//             return res
//                 .status(404)
//                 .json({ success: false, message: "Tender not found" });
//         }

//         const query = { tenderId: tender._id, deleted: false };

//         if (req.query.after) {
//             const after = new Date(req.query.after);
//             if (!isNaN(after.getTime())) query.createdAt = { $gt: after };
//         }

//         // Newest first + limit 100, then reverse for chronological display.
//         const messages = await TenderChatMessage.find(query)
//             .sort({ createdAt: -1 })
//             .limit(100)
//             .lean();
//         messages.reverse();

//         const viewerIsMgmt = isManagement(req.user);
//         const readField = viewerIsMgmt ? "readByMgmt" : "readByUser";

//         await TenderChatMessage.updateMany(
//             {
//                 tenderId: tender._id,
//                 senderRole: viewerIsMgmt ? "user" : "management",
//                 [readField]: false,
//             },
//             { $set: { [readField]: true } },
//         );

//         res.json({ success: true, data: messages });
//     } catch (error) {
//         console.error("listMessages error:", error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// /* --------------------------------------------------------------
//  * SEND a message — POST /api/tenders/:id/chat
//  * -------------------------------------------------------------- */
// const sendMessage = async (req, res) => {
//     try {
//         const tender = await Tender.findById(req.params.id);
//         if (!tender) {
//             return res
//                 .status(404)
//                 .json({ success: false, message: "Tender not found" });
//         }

//         const { body = "", attachments: rawAttachments } = req.body;

//         let attachments = [];
//         if (typeof rawAttachments === "string") {
//             try {
//                 attachments = JSON.parse(rawAttachments);
//             } catch {
//                 attachments = [];
//             }
//         } else if (Array.isArray(rawAttachments)) {
//             attachments = rawAttachments;
//         }

//         const text = String(body || "").trim();

//         if (!text && attachments.length === 0) {
//             return res
//                 .status(400)
//                 .json({ success: false, message: "Message is empty" });
//         }

//         const viewerIsMgmt = isManagement(req.user);

//         const msg = await TenderChatMessage.create({
//             tenderId: tender._id,
//             sender: req.user._id,
//             senderRole: viewerIsMgmt ? "management" : "user",
//             senderName: req.user.fullName || "User",
//             senderPhoto: req.user.profilePhoto || "",
//             body: text,
//             attachments: attachments.map((a) => ({
//                 name: a.name || "",
//                 url: a.url || "",
//                 size: Number(a.size) || 0,
//                 mimeType: a.mimeType || "",
//                 kind: a.kind || pickKind(a.mimeType || ""),
//             })),
//             readByUser: !viewerIsMgmt,
//             readByMgmt: viewerIsMgmt,
//         });

//         // Broadcast live via the shared socket.io server
//         emitToTender(String(tender._id), "tender:chat:new", msg);

//         res.status(201).json({ success: true, data: msg });
//     } catch (error) {
//         console.error("sendMessage error:", error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// /* --------------------------------------------------------------
//  * UPLOAD — POST /api/tenders/:id/chat/upload
//  * -------------------------------------------------------------- */
// const uploadChatFile = async (req, res) => {
//     try {
//         if (!req.file) {
//             return res
//                 .status(400)
//                 .json({ success: false, message: "No file uploaded" });
//         }

//         const url = toPublicUploadUrl(req.file.path);
//         if (!url) {
//             return res.status(500).json({
//                 success: false,
//                 message: "Could not resolve upload path",
//             });
//         }

//         console.log(
//             "[tenderChat.upload] ✅",
//             url,
//             "←",
//             req.file.originalname,
//             `(${req.file.mimetype})`,
//         );

//         res.status(201).json({
//             success: true,
//             data: {
//                 name: req.file.originalname,
//                 url,
//                 size: req.file.size,
//                 mimeType: req.file.mimetype,
//                 kind: pickKind(req.file.mimetype),
//             },
//         });
//     } catch (error) {
//         console.error("uploadChatFile error:", error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// /* --------------------------------------------------------------
//  * UNREAD — GET /api/tenders/:id/chat/unread
//  * -------------------------------------------------------------- */
// const unreadCount = async (req, res) => {
//     try {
//         const viewerIsMgmt = isManagement(req.user);
//         const readField = viewerIsMgmt ? "readByMgmt" : "readByUser";

//         const count = await TenderChatMessage.countDocuments({
//             tenderId: req.params.id,
//             senderRole: viewerIsMgmt ? "user" : "management",
//             [readField]: false,
//             deleted: false,
//         });

//         res.json({ success: true, data: { count } });
//     } catch (error) {
//         console.error("unreadCount error:", error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// /* --------------------------------------------------------------
//  * INBOX — GET /api/tenders/chat/inbox
//  * -------------------------------------------------------------- */
// const inbox = async (req, res) => {
//     try {
//         const viewerIsMgmt = isManagement(req.user);
//         const readField = viewerIsMgmt ? "readByMgmt" : "readByUser";

//         const rows = await TenderChatMessage.aggregate([
//             { $match: { deleted: false } },
//             { $sort: { createdAt: -1 } },
//             {
//                 $group: {
//                     _id: "$tenderId",
//                     lastMessage: { $first: "$$ROOT" },
//                     total: { $sum: 1 },
//                     unread: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $and: [
//                                         {
//                                             $eq: [
//                                                 "$senderRole",
//                                                 viewerIsMgmt ? "user" : "management",
//                                             ],
//                                         },
//                                         { $eq: [`$${readField}`, false] },
//                                     ],
//                                 },
//                                 1,
//                                 0,
//                             ],
//                         },
//                     },
//                 },
//             },
//             { $sort: { "lastMessage.createdAt": -1 } },
//             { $limit: 200 },
//         ]);

//         const tenderIds = rows.map((r) => r._id);
//         const tenders = await Tender.find({ _id: { $in: tenderIds } })
//             .select("tenderer title stage owner departmentId")
//             .populate("owner", "fullName email profilePhoto")
//             .lean();

//         const tenderMap = new Map(tenders.map((t) => [String(t._id), t]));

//         const data = rows
//             .map((r) => {
//                 const t = tenderMap.get(String(r._id));
//                 if (!t) return null;
//                 return {
//                     tenderId: String(r._id),
//                     tenderer: t.tenderer,
//                     title: t.title,
//                     stage: t.stage,
//                     owner: t.owner
//                         ? {
//                             _id: String(t.owner._id),
//                             fullName: t.owner.fullName,
//                             email: t.owner.email,
//                             profilePhoto: t.owner.profilePhoto || "",
//                         }
//                         : null,
//                     total: r.total,
//                     unread: r.unread,
//                     lastMessage: {
//                         _id: String(r.lastMessage._id),
//                         senderRole: r.lastMessage.senderRole,
//                         senderName: r.lastMessage.senderName,
//                         body: r.lastMessage.body,
//                         attachments: r.lastMessage.attachments || [],
//                         createdAt: r.lastMessage.createdAt,
//                     },
//                 };
//             })
//             .filter(Boolean);

//         res.json({ success: true, data });
//     } catch (error) {
//         console.error("inbox error:", error);
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

// module.exports = {
//     listMessages,
//     sendMessage,
//     uploadChatFile,
//     unreadCount,
//     inbox,
// };



// src/controllers/tender/tenderChat.controller.js
const Tender = require("../../models/Tender.model");
const TenderChatMessage = require("../../models/TenderChatMessage.model");
const { emitToTender } = require("../../socket");

const MGMT_ROLES = [
  "super_admin",
  "admin",
  "hr_manager",
  "dept_manager",
  "project_manager",
];

const isManagement = (user) => MGMT_ROLES.includes(user?.role);

function toPublicUploadUrl(absPath) {
  if (!absPath) return "";
  const normalized = absPath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/uploads/");
  if (idx === -1) return "";
  return normalized.slice(idx);
}

function pickKind(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

/* --------------------------------------------------------------
 * LIST messages — GET /api/tenders/:id/chat?after=<ISO>
 * -------------------------------------------------------------- */
const listMessages = async (req, res) => {
  try {
    // Skip the extra tender fetch — just query messages.
    // If tender doesn't exist, the query returns [] which is fine.
    const query = { tenderId: req.params.id, deleted: false };

    if (req.query.after) {
      const after = new Date(req.query.after);
      if (!isNaN(after.getTime())) query.createdAt = { $gt: after };
    }

    const messages = await TenderChatMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    messages.reverse();

    // Fire-and-forget the read update — don't wait
    const viewerIsMgmt = isManagement(req.user);
    const readField = viewerIsMgmt ? "readByMgmt" : "readByUser";

    TenderChatMessage.updateMany(
      {
        tenderId: req.params.id,
        senderRole: viewerIsMgmt ? "user" : "management",
        [readField]: false,
      },
      { $set: { [readField]: true } },
    ).catch(() => {});

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error("listMessages error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* --------------------------------------------------------------
 * SEND a message — POST /api/tenders/:id/chat
 * -------------------------------------------------------------- */
const sendMessage = async (req, res) => {
  try {
    const tender = await Tender.findById(req.params.id)
      .select("_id")
      .lean();
    if (!tender) {
      return res
        .status(404)
        .json({ success: false, message: "Tender not found" });
    }

    const { body = "", attachments: rawAttachments } = req.body;

    let attachments = [];
    if (typeof rawAttachments === "string") {
      try {
        attachments = JSON.parse(rawAttachments);
      } catch {
        attachments = [];
      }
    } else if (Array.isArray(rawAttachments)) {
      attachments = rawAttachments;
    }

    const text = String(body || "").trim();

    if (!text && attachments.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Message is empty" });
    }

    const viewerIsMgmt = isManagement(req.user);

    const msg = await TenderChatMessage.create({
      tenderId: tender._id,
      sender: req.user._id,
      senderRole: viewerIsMgmt ? "management" : "user",
      senderName: req.user.fullName || "User",
      senderPhoto: req.user.profilePhoto || "",
      body: text,
      attachments: attachments.map((a) => ({
        name: a.name || "",
        url: a.url || "",
        size: Number(a.size) || 0,
        mimeType: a.mimeType || "",
        kind: a.kind || pickKind(a.mimeType || ""),
      })),
      readByUser: !viewerIsMgmt,
      readByMgmt: viewerIsMgmt,
    });

    // Respond immediately, then broadcast
    res.status(201).json({ success: true, data: msg });

    emitToTender(String(tender._id), "tender:chat:new", msg);
  } catch (error) {
    console.error("sendMessage error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* --------------------------------------------------------------
 * UPLOAD — POST /api/tenders/:id/chat/upload
 * -------------------------------------------------------------- */
const uploadChatFile = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const url = toPublicUploadUrl(req.file.path);
    if (!url) {
      return res.status(500).json({
        success: false,
        message: "Could not resolve upload path",
      });
    }

    res.status(201).json({
      success: true,
      data: {
        name: req.file.originalname,
        url,
        size: req.file.size,
        mimeType: req.file.mimetype,
        kind: pickKind(req.file.mimetype),
      },
    });
  } catch (error) {
    console.error("uploadChatFile error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* --------------------------------------------------------------
 * UNREAD — GET /api/tenders/:id/chat/unread
 * -------------------------------------------------------------- */
const unreadCount = async (req, res) => {
  try {
    const viewerIsMgmt = isManagement(req.user);
    const readField = viewerIsMgmt ? "readByMgmt" : "readByUser";

    const count = await TenderChatMessage.countDocuments({
      tenderId: req.params.id,
      senderRole: viewerIsMgmt ? "user" : "management",
      [readField]: false,
      deleted: false,
    });

    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error("unreadCount error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* --------------------------------------------------------------
 * INBOX — GET /api/tenders/chat/inbox
 * -------------------------------------------------------------- */
const inbox = async (req, res) => {
  try {
    const viewerIsMgmt = isManagement(req.user);
    const readField = viewerIsMgmt ? "readByMgmt" : "readByUser";

    // Window to last 30 days to keep the aggregation cheap
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await TenderChatMessage.aggregate([
      { $match: { deleted: false, createdAt: { $gte: since } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$tenderId",
          lastMessage: { $first: "$$ROOT" },
          total: { $sum: 1 },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$senderRole",
                        viewerIsMgmt ? "user" : "management",
                      ],
                    },
                    { $eq: [`$${readField}`, false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { "lastMessage.createdAt": -1 } },
      { $limit: 100 },
    ]);

    if (rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const tenderIds = rows.map((r) => r._id);
    const tenders = await Tender.find({ _id: { $in: tenderIds } })
      .select("tenderer title stage owner")
      .populate("owner", "fullName email profilePhoto")
      .lean();

    const tenderMap = new Map(tenders.map((t) => [String(t._id), t]));

    const data = rows
      .map((r) => {
        const t = tenderMap.get(String(r._id));
        if (!t) return null;
        return {
          tenderId: String(r._id),
          tenderer: t.tenderer,
          title: t.title,
          stage: t.stage,
          owner: t.owner
            ? {
                _id: String(t.owner._id),
                fullName: t.owner.fullName,
                email: t.owner.email,
                profilePhoto: t.owner.profilePhoto || "",
              }
            : null,
          total: r.total,
          unread: r.unread,
          lastMessage: {
            _id: String(r.lastMessage._id),
            senderRole: r.lastMessage.senderRole,
            senderName: r.lastMessage.senderName,
            body: r.lastMessage.body,
            attachments: r.lastMessage.attachments || [],
            createdAt: r.lastMessage.createdAt,
          },
        };
      })
      .filter(Boolean);

    res.json({ success: true, data });
  } catch (error) {
    console.error("inbox error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  listMessages,
  sendMessage,
  uploadChatFile,
  unreadCount,
  inbox,
};