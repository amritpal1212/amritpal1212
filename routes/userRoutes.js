const express = require('express');
const router = express.Router();
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Users = require('../models/Users');

// Register route
router.post('/register', async (req, res) => {
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

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please fill all required fields' });
        }

        const user = await Users.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User email or password is incorrect' });
        }

        const validateUser = await bcryptjs.compare(password, user.password);
        if (!validateUser) {
            return res.status(400).json({ message: 'User email or password is incorrect' });
        }

        const payload = {
            userId: user._id,
            email: user.email
        }
        const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';

        jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
            if (err) {
                return res.status(500).json({ message: 'Error generating token' });
            }
            await Users.updateOne({ _id: user._id }, {
                $set: { token }
            });
            return res.status(200).json({ 
                user: { 
                    id: user._id, 
                    email: user.email, 
                    fullName: user.fullName 
                }, 
                token: token 
            });
        });
    } catch (error) {
        console.log(error, 'Error');
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all users except current user
router.get('/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const users = await Users.find({ _id: { $ne: userId } });
        const usersData = Promise.all(users.map(async (user) => {
            return { user: { email: user.email, fullName: user.fullName, receiverId: user._id } }
        }));
        res.status(200).json(await usersData);
    } catch (error) {
        console.log('Error', error);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// Search users by email
router.get('/search/:email', async (req, res) => {
    try {
        const email = req.params.email;
        const userId = req.query.userId;

        const users = await Users.find({
            email: { $regex: email, $options: 'i' },
            _id: { $ne: userId }
        }).select('email fullName _id');

        res.status(200).json(users);
    } catch (error) {
        console.error('Error in search:', error);
        res.status(500).json({ message: 'Error searching users' });
    }
});

module.exports = router; 