const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
    try {
        const data = await resend.emails.send({
            from: 'MindComfort <onboarding@resend.dev>',
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: options.html,
        });

        console.log(`Email sent successfully:`, data);
        return data;
    } catch (error) {
        console.error("Detailed Error:", error);
        throw new Error(`Email service failed: ${error.message}`);
    }
};

module.exports = sendEmail;