const express = require('express');
const router = express.Router();
const Conversations = require('../models/Conversations');
const Users = require('../models/Users');

// Create new conversation
router.post('/', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body;
        const newConversation = new Conversations({ members: [senderId, receiverId] });
        await newConversation.save();
        res.status(200).json({ message: 'Conversation created successfully' });
    } catch (error) {
        console.log(error, 'Error');
        res.status(500).json({ message: 'Error creating conversation' });
    }
});

// Get conversations for a user
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const conversations = await Conversations.find({ members: { $in: [userId] } });
        const conversationUserData = await Promise.all(conversations.map(async (conversation) => {
            const receiverId = conversation.members.find((member) => member !== userId);
            const user = await Users.findById(receiverId);
            
            // Skip if user not found
            if (!user) return null;

            return { 
                user: { 
                    receiverId: user._id, 
                    email: user.email, 
                    fullName: user.fullName 
                }, 
                conversationId: conversation._id 
            };
        }));

        // Filter out null values
        const validConversations = conversationUserData.filter(conv => conv !== null);
        
        res.status(200).json(validConversations);
    } catch (error) {
        console.error('Error in conversations:', error);
        res.status(500).json({ message: 'Error fetching conversations' });
    }
});

module.exports = router; 