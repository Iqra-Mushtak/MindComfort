// const nodemailer = require('nodemailer');

// const transporter = nodemailer.createTransport({
//   host: 'smtp-relay.brevo.com',
//   port: 587,
//   secure: false,
//   auth: {
//     user: process.env.BREVO_USER,
//     pass: process.env.BREVO_PASS,
//   },
// });

// const sendEmail = async (options) => {
//   const mailOptions = {
//     from: `"MindComfort" <${process.env.BREVO_USER}>`,
//     to: options.email,
//     subject: options.subject,
//     text: options.message,
//     html: options.html,
//   };

//   try {
//     const info = await transporter.sendMail(mailOptions);
//     console.log(`Email sent successfully: ${info.messageId}`);
//     return info;
//   } catch (error) {
//     console.error("Detailed Error:", error);
//     throw new Error(`Email service failed: ${error.message}`);
//   }
// };

// module.exports = sendEmail;

const axios = require('axios');

const sendEmail = async (options) => {
    const url = 'https://api.brevo.com/v3/smtp/email';
    
    const data = {
        sender: {
            name: "MindComfort",
            email: process.env.BREVO_USER 
        },
        to: [
            {
                email: options.email
            }
        ],
        subject: options.subject,
        htmlContent: options.html || options.message
    };

    const headers = {
        'api-key': process.env.BREVO_PASS, 
        'Content-Type': 'application/json'
    };

    try {
        const response = await axios.post(url, data, { headers });
        console.log(`Email sent successfully via API: ${response.data.messageId}`);
        return response.data;
    } catch (error) {
        console.error("Detailed Error:", error.response ? error.response.data : error.message);
        throw new Error(`Email service failed: ${error.message}`);
    }
};

module.exports = sendEmail;