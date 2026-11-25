import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const app = initializeApp({
    apiKey: 'AIzaSyCrkzpcM7BBopIs2EqJllNz6QNqu1299gA',
    authDomain: 'spotmocity-9aa17.firebaseapp.com',
    databaseURL: 'https://spotmocity-9aa17-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'spotmocity-9aa17',
    storageBucket: 'spotmocity-9aa17.firebasestorage.app',
    messagingSenderId: '732588189317',
    appId: '1:732588189317:web:a2a4a4489b8167ff59abec'
});

export { app };
export const database = getDatabase(app);
