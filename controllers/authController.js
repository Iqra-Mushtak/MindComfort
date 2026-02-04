const User = require('../models/User');
const bcrypt = require('bcryptjs');

exports.createAdmin = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const adminExists = await User.findOne({ role: 'admin' });
        if (adminExists) {
            return res.status(400).json({ message: "Admin account already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = new User({
            username,
            email,
            password: hashedPassword,
            role: 'admin',
            isVerified: true, 
            status: 'approved' 
        });

        await admin.save();
        res.status(201).json({ message: "Admin created successfully." });

    } catch (error) {
        res.status(500).json({ message: "Admin creation failed.", error: error.message });
    }
};

exports.createModerator = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Email already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);

        const moderator = new User({
            username,
            email,
            password: hashedPassword,
            role: 'moderator',
            isVerified: true, 
            status: 'approved'
        });

        await moderator.save();
        res.status(201).json({ message: "Moderator account created successfully." });
    } catch (error) {
        res.status(500).json({ message: "Moderator creation failed.", error: error.message });
    }
};

exports.register = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists." });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role
        });

    await newUser.save();

    res.status(201).json({ message: "Account created successfully."});

    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};



