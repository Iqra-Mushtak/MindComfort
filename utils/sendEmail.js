const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

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
        console.error("Email failed to send:", error);
        throw error; 
    }
};

module.exports = sendEmail;