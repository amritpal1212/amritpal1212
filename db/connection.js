const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';

const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            console.log('MongoDB is already connected');
            return;
        }
        
        await mongoose.connect(url, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

connectDB();