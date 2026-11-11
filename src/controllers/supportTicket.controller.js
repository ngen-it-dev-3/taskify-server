// controllers/supportTicket.controller.js
const { SupportTicket } = require("../models/SupportTicket.model");
const { User } = require("../models/User.model");
const path = require("path");
const fs = require("fs");

// ============================================================
// GET TICKETS
// ============================================================
const getTickets = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = "",
            status = "",
            priority = "",
            category = "",
            dateFrom = "",
            dateTo = "",
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const userId = req.user._id;

        // Build filter
        const filter = { createdBy: userId };

        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (category) filter.category = category;

        // Date range
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }

        // Search
        if (search) {
            filter.$or = [
                { subject: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { ticketNumber: { $regex: search, $options: "i" } },
            ];
        }

        // Get tickets
        const tickets = await SupportTicket.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate("createdBy", "name email")
            .populate("assignedTo", "name email");

        // Map tickets to include id
        const mappedTickets = tickets.map(ticket => ({
            ...ticket.toObject(),
            id: ticket._id.toString(),
        }));

        // Get total count
        const total = await SupportTicket.countDocuments(filter);

        // Get stats
        const stats = await SupportTicket.getStats(userId);

        res.json({
            success: true,
            data: {
                tickets: mappedTickets,
                stats,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        console.error("Get tickets error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// CREATE TICKET - With File Upload
// ============================================================
const createTicket = async (req, res) => {
    try {
        const { subject, description, category, priority } = req.body;
        const userId = req.user._id;

        if (!subject || !description) {
            return res.status(400).json({
                success: false,
                message: "Subject and description are required",
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Handle file uploads
        const attachments = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach((file) => {
                attachments.push({
                    name: file.originalname,
                    size: file.size,
                    url: `/uploads/support/${file.filename}`,
                });
            });
        }

        const ticket = new SupportTicket({
            subject,
            description,
            category: category || "other",
            priority: priority || "medium",
            createdBy: userId,
            attachments: attachments,
            messages: [{
                message: description,
                isAdmin: false,
                userId: userId,
                userName: user.name || user.fullName || "User",
                userEmail: user.email,
                attachments: attachments,
            }],
            status: "open",
        });

        await ticket.save();

        const populatedTicket = await SupportTicket.findById(ticket._id)
            .populate("createdBy", "name email")
            .populate("assignedTo", "name email");

        // Add id field
        const ticketData = populatedTicket.toObject ? populatedTicket.toObject() : populatedTicket;
        ticketData.id = ticketData._id.toString();

        res.json({
            success: true,
            data: { ticket: ticketData },
            message: "Ticket created successfully",
        });
    } catch (error) {
        console.error("Create ticket error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// REPLY TO TICKET - With File Upload
// ============================================================
const replyToTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const userId = req.user._id;

        // Validate ticket exists
        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID",
            });
        }

        if (!message && (!req.files || req.files.length === 0)) {
            return res.status(400).json({
                success: false,
                message: "Message or attachment is required",
            });
        }

        const ticket = await SupportTicket.findById(id);
        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        // Check if user owns this ticket
        if (ticket.createdBy.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Handle file uploads
        const attachments = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach((file) => {
                attachments.push({
                    name: file.originalname,
                    size: file.size,
                    url: `/uploads/support/${file.filename}`,
                });
            });
        }

        // Add message
        ticket.messages.push({
            message: message || "",
            isAdmin: req.user.isAdmin || false,
            userId: userId,
            userName: user.name || user.fullName || "User",
            userEmail: user.email,
            attachments: attachments,
        });

        // Add attachments to ticket
        if (attachments.length > 0) {
            ticket.attachments = [...ticket.attachments, ...attachments];
        }

        // Update status if closed
        if (ticket.status === "closed") {
            ticket.status = "open";
        }

        await ticket.save();

        const populatedTicket = await SupportTicket.findById(ticket._id)
            .populate("createdBy", "name email")
            .populate("assignedTo", "name email");

        const ticketData = populatedTicket.toObject ? populatedTicket.toObject() : populatedTicket;
        ticketData.id = ticketData._id.toString();

        res.json({
            success: true,
            data: { ticket: ticketData },
            message: "Reply sent successfully",
        });
    } catch (error) {
        console.error("Reply to ticket error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// CLOSE TICKET
// ============================================================
const closeTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID",
            });
        }

        const ticket = await SupportTicket.findById(id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        // Check if user owns this ticket
        if (ticket.createdBy.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        ticket.status = "closed";
        ticket.closedAt = new Date();

        await ticket.save();

        res.json({
            success: true,
            message: "Ticket closed successfully",
        });
    } catch (error) {
        console.error("Close ticket error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// REOPEN TICKET
// ============================================================
const reopenTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID",
            });
        }

        const ticket = await SupportTicket.findById(id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        // Check if user owns this ticket
        if (ticket.createdBy.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        ticket.status = "open";
        ticket.closedAt = null;

        await ticket.save();

        res.json({
            success: true,
            message: "Ticket reopened successfully",
        });
    } catch (error) {
        console.error("Reopen ticket error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// RATE TICKET
// ============================================================
const rateTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, feedback } = req.body;
        const userId = req.user._id;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID",
            });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5",
            });
        }

        const ticket = await SupportTicket.findById(id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        // Check if user owns this ticket
        if (ticket.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        ticket.rating = rating;
        if (feedback) ticket.feedback = feedback;

        await ticket.save();

        res.json({
            success: true,
            message: "Rating submitted successfully",
        });
    } catch (error) {
        console.error("Rate ticket error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// GET TICKET BY ID
// ============================================================
const getTicketById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        if (!id || id === "undefined") {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID",
            });
        }

        const ticket = await SupportTicket.findById(id)
            .populate("createdBy", "name email")
            .populate("assignedTo", "name email")
            .populate("messages.userId", "name email");

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        // Check if user owns this ticket or is admin
        if (ticket.createdBy._id.toString() !== userId.toString() && !req.user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const ticketData = ticket.toObject ? ticket.toObject() : ticket;
        ticketData.id = ticketData._id.toString();

        res.json({
            success: true,
            data: { ticket: ticketData },
        });
    } catch (error) {
        console.error("Get ticket error:", error);
        res.status(500).json({
            success: false,
            message: "Server error: " + error.message,
        });
    }
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    getTickets,
    createTicket,
    replyToTicket,
    closeTicket,
    reopenTicket,
    rateTicket,
    getTicketById,
};