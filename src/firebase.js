import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDSO4E3TZfN-5uP-15EKY3ID_RPTzFP2-Q",
  authDomain: "dt-study-hub.firebaseapp.com",
  projectId: "dt-study-hub",
  storageBucket: "dt-study-hub.appspot.com",
  messagingSenderId: "182982760604",
  appId: "1:182982760604:web:6eec051d6c7583f2cf7559",
  measurementId: "G-2S3CFQF08J",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export both the Database (db) AND Authentication (auth)
export const db = getFirestore(app);
export const auth = getAuth(app);
