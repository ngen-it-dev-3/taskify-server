// scripts/migrate-crawler-drafts.js
require("dotenv").config();
const mongoose = require("mongoose");
const Tender = require("../src/models/Tender.model");

(async () => {
    try {
        const uri = process.env.MONGODB_URI;   // 👈 changed
        if (!uri) {
            throw new Error("MONGODB_URI is not set. Check your .env file.");
        }

        await mongoose.connect(uri);
        console.log("✅ Connected to MongoDB");

        const res = await Tender.updateMany(
            { draft: true, recordedBy: "Auto-discovered" },
            { $set: { draft: false, stage: "potential" } }
        );

        console.log(`✅ Migrated ${res.modifiedCount} crawler drafts → Potential`);
        console.log(`   Matched: ${res.matchedCount}`);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();