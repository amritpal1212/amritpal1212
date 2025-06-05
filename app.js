const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
const conversationRoutes = require('./routes/conversationRoutes');

require('dotenv').config();

// Connect DB
require('./db/connection');

// Import Files
const Users = require('./models/Users');
const Conversations = require('./models/Conversations');
const Messages = require('./models/Messages');

// app Use
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/conversations', conversationRoutes);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';
mongoose.connect(MONGODB_URI)
	.then(() => console.log('Connected to MongoDB'))
	.catch((err) => console.error('MongoDB connection error:', err));

// Socket.io
const io = new Server(server, {
	cors: {
		origin: process.env.CLIENT_URL || "http://localhost:3000",
		methods: ["GET", "POST"]
	}
});

const port = process.env.PORT || 8000;

// Socket.io
let users = [];
let messageQueue = new Map();

io.on('connection', socket => {
	console.log('User connected:', socket.id);

	socket.on('addUser', userId => {
		// Remove user if they already exist
		const existingUser = Array.from(io.sockets.sockets.values())
			.find(s => s.userId === userId);
		if (existingUser) {
			existingUser.disconnect();
		}
		socket.userId = userId;
	});

	socket.on('sendMessage', async (data) => {
		const messageKey = `${data.senderId}-${data.message}-${data.timestamp}`;
		
		// Check if message is already in queue
		if (messageQueue.has(messageKey)) {
			return;
		}

		// Add message to queue
		messageQueue.set(messageKey, data);

		try {
			const receiver = Array.from(io.sockets.sockets.values())
				.find(s => s.userId === data.receiverId);

			if (receiver) {
				io.to(receiver.id).emit('getMessage', {
					senderId: data.senderId,
					message: data.message,
					conversationId: data.conversationId,
					timestamp: data.timestamp,
					user: {
						id: data.senderId,
						fullName: data.senderName,
						email: data.senderEmail
					}
				});
			}

			// Remove message from queue after processing
			messageQueue.delete(messageKey);
		} catch (error) {
			console.error('Error sending message:', error);
			messageQueue.delete(messageKey);
		}
	});

	socket.on('disconnect', () => {
		console.log('User disconnected:', socket.id);
	});
});

// Routes
app.get('/', (req, res) => {
	res.send('Welcome');
})

app.post('/api/register', async (req, res) => {
	try {
		const { fullName, email, password } = req.body;

		if (!fullName || !email || !password) {
			return res.status(400).json({ message: 'Please fill all required fields' });
		}

		const isAlreadyExist = await Users.findOne({ email });
		if (isAlreadyExist) {
			return res.status(400).json({ message: 'User already exists' });
		}

		const newUser = new Users({ fullName, email });
		bcryptjs.hash(password, 10, async (err, hashedPassword) => {
			if (err) {
				return res.status(500).json({ message: 'Error hashing password' });
			}
			newUser.set('password', hashedPassword);
			await newUser.save();
			
			const payload = {
				userId: newUser._id,
				email: newUser.email
			}
			const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';

			jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
				if (err) {
					return res.status(500).json({ message: 'Error generating token' });
				}
				await Users.updateOne({ _id: newUser._id }, {
					$set: { token }
				});
				return res.status(200).json({ 
					user: { 
						id: newUser._id, 
						email: newUser.email, 
						fullName: newUser.fullName 
					}, 
					token: token 
				});
			});
		});
	} catch (error) {
		console.log(error, 'Error');
		return res.status(500).json({ message: 'Internal server error' });
	}
});

app.post('/api/login', async (req, res, next) => {
	try {
		const { email, password } = req.body;

		if (!email || !password) {
			res.status(400).send('Please fill all required fields');
		} else {
			const user = await Users.findOne({ email });
			if (!user) {
				res.status(400).send('User email or password is incorrect');
			} else {
				const validateUser = await bcryptjs.compare(password, user.password);
				if (!validateUser) {
					res.status(400).send('User email or password is incorrect');
				} else {
					const payload = {
						userId: user._id,
						email: user.email
					}
					const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';

					jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
						await Users.updateOne({ _id: user._id }, {
							$set: { token }
						})
						user.save();
						return res.status(200).json({ user: { id: user._id, email: user.email, fullName: user.fullName }, token: token })
					})
				}
			}
		}

	} catch (error) {
		console.log(error, 'Error')
	}
})

app.post('/api/conversation', async (req, res) => {
	try {
		const { senderId, receiverId } = req.body;
		const newCoversation = new Conversations({ members: [senderId, receiverId] });
		await newCoversation.save();
		res.status(200).send('Conversation created successfully');
	} catch (error) {
		console.log(error, 'Error')
	}
})

app.get('/api/conversations/:userId', async (req, res) => {
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
			}
		}));

		// Filter out null values
		const validConversations = conversationUserData.filter(conv => conv !== null);
		
		res.status(200).json(validConversations);
	} catch (error) {
		console.error('Error in conversations:', error);
		res.status(500).json({ message: 'Error fetching conversations' });
	}
})

app.post('/api/message', async (req, res) => {
	try {
		const { conversationId, senderId, message, receiverId = '' } = req.body;
		if (!senderId || !message) return res.status(400).send('Please fill all required fields')
		if (conversationId === 'new' && receiverId) {
			const newCoversation = new Conversations({ members: [senderId, receiverId] });
			await newCoversation.save();
			const newMessage = new Messages({ conversationId: newCoversation._id, senderId, message });
			await newMessage.save();
			return res.status(200).send('Message sent successfully');
		} else if (!conversationId && !receiverId) {
			return res.status(400).send('Please fill all required fields')
		}
		const newMessage = new Messages({ conversationId, senderId, message });
		await newMessage.save();
		res.status(200).send('Message sent successfully');
	} catch (error) {
		console.log(error, 'Error')
	}
})

app.get('/api/message/:conversationId', async (req, res) => {
	try {
		const checkMessages = async (conversationId) => {
			console.log(conversationId, 'conversationId')
			const messages = await Messages.find({ conversationId });
			const messageUserData = Promise.all(messages.map(async (message) => {
				const user = await Users.findById(message.senderId);
				return { user: { id: user._id, email: user.email, fullName: user.fullName }, message: message.message }
			}));
			res.status(200).json(await messageUserData);
		}
		const conversationId = req.params.conversationId;
		if (conversationId === 'new') {
			const checkConversation = await Conversations.find({ members: { $all: [req.query.senderId, req.query.receiverId] } });
			if (checkConversation.length > 0) {
				checkMessages(checkConversation[0]._id);
			} else {
				return res.status(200).json([])
			}
		} else {
			checkMessages(conversationId);
		}
	} catch (error) {
		console.log('Error', error)
	}
})

app.get('/api/users/:userId', async (req, res) => {
	try {
		const userId = req.params.userId;
		const users = await Users.find({ _id: { $ne: userId } });
		const usersData = Promise.all(users.map(async (user) => {
			return { user: { email: user.email, fullName: user.fullName, receiverId: user._id } }
		}));
		res.status(200).json(await usersData);
	} catch (error) {
		console.log('Error', error)
	}
})

app.get('/api/search/:email', async (req, res) => {
	try {
		const email = req.params.email;
		const userId = req.query.userId; // Get the current user's ID from query

		// Search for users with matching email, excluding the current user
		const users = await Users.find({
			email: { $regex: email, $options: 'i' }, // Case-insensitive search
			_id: { $ne: userId } // Exclude current user
		}).select('email fullName _id'); // Only select needed fields

		res.status(200).json(users);
	} catch (error) {
		console.error('Error in search:', error);
		res.status(500).json({ message: 'Error searching users' });
	}
});

// Health check endpoint
app.get('/health', (req, res) => {
	res.status(200).json({ status: 'ok' })
})

server.listen(port, () => {
	console.log(`Server running on port ${port}`);
})