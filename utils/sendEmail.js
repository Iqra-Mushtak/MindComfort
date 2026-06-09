const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    // service: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    pool: true,
});

const sendEmail = async (options) => {

    const mailOptions = {
        from: `MindComfort <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html,
    };

    try{
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to: ${options.email}`);
    } catch (error) {
        // console.error("Email failed to send:", error.message);
        // throw new Error('Email service is currently unavailable.'); 
        console.error("Detailed Error:", error);
        throw new Error(`Email service failed: ${error.message}`);
    }
};

module.exports = sendEmail;