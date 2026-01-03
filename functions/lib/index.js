"use strict";
/**
 * Firebase Cloud Functions for Exam Notifications
 *
 * Scheduled function that scrapes NBE and AIIMS for exam updates.
 * Runs 3 times daily and stores results in Firestore.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestNotifications = exports.manualCheckExamUpdates = exports.checkExamUpdates = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const scrapeExams_1 = require("./scrapeExams");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
// Collection references
const NOTIFICATIONS_COLLECTION = 'exam_notifications';
const LATEST_DOC = 'latest';
/**
 * Scheduled function to check for exam updates
 * Runs at 8:00 AM, 2:00 PM, and 8:00 PM IST
 */
exports.checkExamUpdates = functions
    .region('asia-south1') // Mumbai region for lower latency in India
    .runWith({
    timeoutSeconds: 120,
    memory: '1GB' // Puppeteer needs more memory
})
    .pubsub
    .schedule('0 8,14,20 * * *') // 8am, 2pm, 8pm every day
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
    console.log('Starting exam update check at:', new Date().toISOString());
    try {
        // Scrape all exam sources
        const notifications = await (0, scrapeExams_1.scrapeAllExams)();
        if (notifications.length === 0) {
            console.log('No new notifications found');
            return null;
        }
        // Get current stored notifications
        const latestDoc = await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).get();
        const existingData = latestDoc.exists ? latestDoc.data() : {};
        // Check for changes
        const newNotifications = [];
        for (const notification of notifications) {
            const existingNotification = existingData === null || existingData === void 0 ? void 0 : existingData[notification.examType.toLowerCase().replace('-', '_')];
            // Compare with existing - if ID or title changed, it's new
            if (!existingNotification ||
                existingNotification.id !== notification.id ||
                existingNotification.title !== notification.title) {
                newNotifications.push(notification);
            }
        }
        if (newNotifications.length > 0) {
            console.log(`Found ${newNotifications.length} NEW notifications!`);
            // Update latest document
            const updateData = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            for (const notification of notifications) {
                const key = notification.examType.toLowerCase().replace('-', '_');
                updateData[key] = notification;
            }
            await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).set(updateData, { merge: true });
            // Add to history
            for (const notification of newNotifications) {
                await db.collection(NOTIFICATIONS_COLLECTION).doc('history').collection('items').add(Object.assign(Object.assign({}, notification), { createdAt: admin.firestore.FieldValue.serverTimestamp() }));
            }
            console.log('Successfully saved notifications to Firestore');
        }
        else {
            console.log('No changes detected');
        }
        return null;
    }
    catch (error) {
        console.error('Error in checkExamUpdates:', error);
        throw error;
    }
});
/**
 * HTTP endpoint to manually trigger a check (for testing)
 */
const cors = require('cors')({ origin: true });
exports.manualCheckExamUpdates = functions
    .region('asia-south1')
    .runWith({
    timeoutSeconds: 300,
    memory: '2GB'
})
    .https.onRequest((req, res) => {
    cors(req, res, async () => {
        console.log('Manual exam update check triggered via App (HTTP)');
        try {
            const notifications = await (0, scrapeExams_1.scrapeAllExams)();
            // Save to Firestore
            if (notifications.length > 0) {
                const updateData = {
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                for (const notification of notifications) {
                    const key = notification.examType.toLowerCase().replace('-', '_');
                    updateData[key] = notification;
                }
                await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).set(updateData, { merge: true });
            }
            res.json({
                success: true,
                count: notifications.length,
                notifications
            });
        }
        catch (error) {
            console.error('Error:', error);
            res.status(500).json({
                success: false,
                error: String(error)
            });
        }
    });
});
/**
 * Get latest notifications (callable from app)
 */
exports.getLatestNotifications = functions
    .region('asia-south1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    try {
        const doc = await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).get();
        if (!doc.exists) {
            return { notifications: [] };
        }
        const data = doc.data();
        const notifications = [];
        if (data === null || data === void 0 ? void 0 : data.neet_ss) {
            notifications.push(data.neet_ss);
        }
        if (data === null || data === void 0 ? void 0 : data.ini_ss) {
            notifications.push(data.ini_ss);
        }
        return {
            notifications,
            lastUpdated: ((_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.updatedAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || null
        };
    }
    catch (error) {
        console.error('Error getting notifications:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get notifications');
    }
});
//# sourceMappingURL=index.js.map