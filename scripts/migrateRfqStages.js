/**
 * scripts/migrateRfqStages.js
 *
 * One-time migration: Sync RFQ.stage with the status of its latest Quotation.
 *
 * Rules applied:
 *   - Quotation.status === 'sent'   → RFQ.stage = 'quoted'
 *   - Quotation.status === 'won'    → RFQ.stage = 'quoted'  (RFQ has no 'won')
 *   - Quotation.status === 'lost'   → RFQ.stage = 'lost'
 *   - Quotation.status === 'draft'  → RFQ.stage unchanged
 *   - Archived RFQs are never modified.
 *
 * Usage:
 *   node scripts/migrateRfqStages.js           # dry-run (safe, shows what WOULD change)
 *   node scripts/migrateRfqStages.js --apply   # actually writes changes
 *   node scripts/migrateRfqStages.js --apply --include-won
 *       (also forces RFQs to 'quoted' when their latest quote is 'won')
 */

require('dotenv').config();

const mongoose = require('mongoose');
const path = require('path');

// ---------- CONFIG ----------
const APPLY = process.argv.includes('--apply');
const INCLUDE_WON_AS_QUOTED = process.argv.includes('--include-won');

const MONGO_URI =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI / MONGODB_URI / DATABASE_URL not set in .env');
    process.exit(1);
}

// ---------- MODELS ----------
// Adjust paths if your folder layout differs.
const RFQ = require(path.resolve(__dirname, '../src/models/rfq/RFQ'));
const Quotation = require(path.resolve(__dirname, '../src/models/Quotation.model'));

// ---------- HELPERS ----------
function log(...args) {
    console.log(`[migrate]`, ...args);
}

function stageFromQuotationStatus(status) {
    switch (status) {
        case 'sent':
            return 'quoted';
        case 'won':
            return INCLUDE_WON_AS_QUOTED ? 'quoted' : null; // null = leave alone
        case 'lost':
            return 'lost';
        default:
            return null; // drafts, awaiting_approval → don't touch RFQ
    }
}

// ---------- MAIN ----------
async function run() {
    log(`Mode: ${APPLY ? '🟢 APPLY (writing)' : '🔵 DRY-RUN (no writes)'}`);
    log(`Treat "won" as "quoted": ${INCLUDE_WON_AS_QUOTED ? 'yes' : 'no'}`);
    log('Connecting to MongoDB…');

    await mongoose.connect(MONGO_URI, {
        // These are usually fine defaults; adjust if your driver complains.
        serverSelectionTimeoutMS: 15000,
    });
    log('✅ Connected');

    try {
        // 1. Find every quotation that could change its RFQ's stage
        const relevantQuotes = await Quotation.find({
            status: { $in: ['sent', 'won', 'lost'] },
        })
            .select('_id rfqId rfqNumber status sentAt createdAt')
            .lean();

        log(`Found ${relevantQuotes.length} relevant quotation(s)`);

        if (relevantQuotes.length === 0) {
            log('Nothing to migrate.');
            return;
        }

        // 2. Group by RFQ — keep the LATEST quote per RFQ
        const latestByRfq = new Map();
        for (const q of relevantQuotes) {
            if (!q.rfqId) continue;
            const key = String(q.rfqId);
            const existing = latestByRfq.get(key);
            const qTime = new Date(q.sentAt || q.createdAt || 0).getTime();
            const eTime = existing
                ? new Date(existing.sentAt || existing.createdAt || 0).getTime()
                : -1;
            if (!existing || qTime > eTime) {
                latestByRfq.set(key, q);
            }
        }

        log(`Distinct RFQs to inspect: ${latestByRfq.size}`);

        // 3. Fetch those RFQs
        const rfqIds = [...latestByRfq.keys()];
        const rfqs = await RFQ.find({ _id: { $in: rfqIds } })
            .select('_id rfqNumber stage company')
            .lean();

        const rfqById = new Map(rfqs.map((r) => [String(r._id), r]));

        // 4. Compute planned changes
        const changes = []; // { rfqId, rfqNumber, company, from, to, reason }
        const skipped = [];

        for (const [rfqId, quote] of latestByRfq.entries()) {
            const rfq = rfqById.get(rfqId);
            if (!rfq) {
                skipped.push({ rfqId, reason: 'RFQ not found', quote: quote.rfqNumber });
                continue;
            }

            // Never touch archived RFQs
            if (rfq.stage === 'archived') {
                skipped.push({
                    rfqId,
                    rfqNumber: rfq.rfqNumber,
                    reason: 'RFQ is archived (protected)',
                });
                continue;
            }

            const targetStage = stageFromQuotationStatus(quote.status);
            if (!targetStage) {
                skipped.push({
                    rfqId,
                    rfqNumber: rfq.rfqNumber,
                    reason: `Quotation status "${quote.status}" → no RFQ change`,
                });
                continue;
            }

            if (rfq.stage === targetStage) {
                skipped.push({
                    rfqId,
                    rfqNumber: rfq.rfqNumber,
                    reason: `Already "${targetStage}" — nothing to do`,
                });
                continue;
            }

            changes.push({
                rfqId,
                rfqNumber: rfq.rfqNumber,
                company: rfq.company,
                from: rfq.stage,
                to: targetStage,
                reason: `quotation ${quote.rfqNumber || ''} status="${quote.status}"`,
            });
        }

        // 5. Print plan
        console.log('\n──────── PLAN ────────');
        if (changes.length === 0) {
            console.log('No changes required. ✅');
        } else {
            for (const c of changes) {
                console.log(
                    `  ${c.rfqNumber}  ${String(c.from).padEnd(10)} → ${String(c.to).padEnd(10)}  (${c.company || '—'})  [${c.reason}]`
                );
            }
        }

        if (skipped.length > 0) {
            console.log('\n──────── SKIPPED ────────');
            for (const s of skipped) {
                console.log(`  ${s.rfqNumber || s.rfqId}  — ${s.reason}`);
            }
        }

        console.log(`\nTotal to update: ${changes.length}`);
        console.log(`Total skipped:   ${skipped.length}`);

        if (!APPLY) {
            console.log('\n🔵 Dry-run complete. Re-run with --apply to write changes.');
            return;
        }

        if (changes.length === 0) {
            console.log('Nothing to apply.');
            return;
        }

        // 6. Apply changes (bulk write)
        console.log('\nApplying changes…');
        const bulkOps = changes.map((c) => ({
            updateOne: {
                filter: { _id: c.rfqId },
                update: { $set: { stage: c.to, updatedAt: new Date() } },
            },
        }));

        const result = await RFQ.bulkWrite(bulkOps, { ordered: false });
        console.log('✅ Bulk write result:');
        console.log(`   matched:  ${result.matchedCount}`);
        console.log(`   modified: ${result.modifiedCount}`);
        console.log(`   upserted: ${result.upsertedCount}`);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        log('Disconnected.');
    }
}

run();