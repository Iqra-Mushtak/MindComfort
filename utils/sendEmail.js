const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

const sendEmail = async (options) => {
    const mailOptions = {
        from: `"MindComfort" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to: ${options.email}`);
    } catch (error) {
        console.error("Detailed Error:", error);
        throw new Error(`Email service failed: ${error.message}`);
    }
};

module.exports = sendEmail;