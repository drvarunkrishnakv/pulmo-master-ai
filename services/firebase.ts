import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDDRWSWVRa325iS59UhCIx6QAHQjui6lzg",
    authDomain: "pulmo-master.firebaseapp.com",
    projectId: "pulmo-master",
    storageBucket: "pulmo-master.firebasestorage.app",
    messagingSenderId: "154344292422",
    appId: "1:154344292422:web:a307294b3fe2ecabaa0a47"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth (for future use)
export const auth = getAuth(app);

// Initialize Functions
import { getFunctions } from "firebase/functions";
export const functions = getFunctions(app, 'asia-south1');

export default app;
