// fix-pinned.js - Run this once to sync existing pinned messages
const mongoose = require("mongoose");
require("dotenv").config();

const { Channel } = require("./src/models/Channel.model");
const { Message } = require("./src/models/Message.model");

const fixPinnedMessages = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        // Find all channels
        const channels = await Channel.find({});
        let totalFixed = 0;

        for (const channel of channels) {
            console.log(`\n📌 Processing: ${channel.name}`);

            // Find all pinned messages in this channel
            const pinnedMessages = await Message.find({
                channelId: channel._id,
                isPinned: true,
                isDeleted: false,
            });

            if (pinnedMessages.length === 0) continue;

            let added = 0;
            for (const msg of pinnedMessages) {
                // Check if already in pinnedFiles
                const exists = channel.pinnedFiles.some(
                    (f) => f.messageId?.toString() === msg._id.toString()
                );

                if (!exists) {
                    // ✅ ADD TO PINNEDFILES
                    await Channel.updateOne(
                        { _id: channel._id },
                        {
                            $push: {
                                pinnedFiles: {
                                    name: msg.content || "Pinned message",
                                    url: `/messages/${msg._id}`,
                                    size: 0,
                                    type: 'message',
                                    messageId: msg._id,
                                    uploadedBy: {
                                        _id: msg.senderId,
                                        fullName: msg.senderId?.fullName || 'Unknown',
                                    },
                                    uploadedAt: msg.createdAt || new Date(),
                                }
                            }
                        }
                    );
                    added++;
                    console.log(`  ✅ Added: "${msg.content?.substring(0, 30) || 'Pinned'}"`);
                }
            }

            if (added > 0) {
                totalFixed += added;
                console.log(`  ✅ Fixed ${added} pinned messages for channel ${channel.name}`);
            }
        }

        console.log(`\n✅ TOTAL FIXED: ${totalFixed} pinned messages`);
        console.log("🎉 Done! Now refresh your frontend.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
};

fixPinnedMessages();