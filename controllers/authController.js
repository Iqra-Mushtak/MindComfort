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
            userId: "ADMIN-" + Date.now(),
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






