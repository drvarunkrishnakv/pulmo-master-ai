/**
 * Firebase Cloud Functions for Exam Notifications
 * 
 * Scheduled function that scrapes NBE and AIIMS for exam updates.
 * Runs 3 times daily and stores results in Firestore.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { scrapeAllExams, ExamNotification } from './scrapeExams';

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
export const checkExamUpdates = functions
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
            const notifications = await scrapeAllExams();

            if (notifications.length === 0) {
                console.log('No new notifications found');
                return null;
            }

            // Get current stored notifications
            const latestDoc = await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).get();
            const existingData = latestDoc.exists ? latestDoc.data() : {};

            // Check for changes
            const newNotifications: ExamNotification[] = [];

            for (const notification of notifications) {
                const existingNotification = existingData?.[notification.examType.toLowerCase().replace('-', '_')];

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
                const updateData: Record<string, unknown> = {
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                for (const notification of notifications) {
                    const key = notification.examType.toLowerCase().replace('-', '_');
                    updateData[key] = notification;
                }

                await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).set(updateData, { merge: true });

                // Add to history
                for (const notification of newNotifications) {
                    await db.collection(NOTIFICATIONS_COLLECTION).doc('history').collection('items').add({
                        ...notification,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                console.log('Successfully saved notifications to Firestore');
            } else {
                console.log('No changes detected');
            }

            return null;
        } catch (error) {
            console.error('Error in checkExamUpdates:', error);
            throw error;
        }
    });

/**
 * HTTP endpoint to manually trigger a check (for testing)
 */
const cors = require('cors')({ origin: true });

export const manualCheckExamUpdates = functions
    .region('asia-south1')
    .runWith({
        timeoutSeconds: 300,
        memory: '2GB'
    })
    .https.onRequest((req, res) => {
        cors(req, res, async () => {
            console.log('Manual exam update check triggered via App (HTTP)');

            try {
                const notifications = await scrapeAllExams();

                // Save to Firestore
                if (notifications.length > 0) {
                    const updateData: Record<string, unknown> = {
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
            } catch (error) {
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
export const getLatestNotifications = functions
    .region('asia-south1')
    .https.onCall(async (data, context) => {
        try {
            const doc = await db.collection(NOTIFICATIONS_COLLECTION).doc(LATEST_DOC).get();

            if (!doc.exists) {
                return { notifications: [] };
            }

            const data = doc.data();
            const notifications: ExamNotification[] = [];

            if (data?.neet_ss) {
                notifications.push(data.neet_ss);
            }
            if (data?.ini_ss) {
                notifications.push(data.ini_ss);
            }

            return {
                notifications,
                lastUpdated: data?.updatedAt?.toDate?.()?.toISOString() || null
            };
        } catch (error) {
            console.error('Error getting notifications:', error);
            throw new functions.https.HttpsError('internal', 'Failed to get notifications');
        }
    });
