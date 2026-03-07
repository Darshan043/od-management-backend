const mongoose = require('mongoose');
const connectDB = async () => {
    try {
        // Forcing Local MongoDB for stability and speed during testing
        console.log('Connecting to Local MongoDB...');
        await mongoose.connect('mongodb://127.0.0.1:27017/od_system', {
            serverSelectionTimeoutMS: 2000
        });
        console.log('Connected to Local MongoDB');
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        console.log('CRITICAL: Running in NO-DB mode (Limited Functionality).');
    }
};

module.exports = connectDB;