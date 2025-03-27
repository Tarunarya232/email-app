import express from "express";
import cors from "cors";
import env from "dotenv";
import nodemailer from "nodemailer";
import Groq from "groq-sdk";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";

// Load environment variables
env.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Groq API Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Function to expand the message using Groq API
const expandMessage = async (message) => {
    try {
        const response = await groq.chat.completions.create({
            model: "mixtral-8x7b-32768",
            messages: [
                { role: "system", content: "Expand this message in a professional and friendly tone." },
                { role: "user", content: message },
            ],
            max_tokens: 200,
        });

        return response.choices[0]?.message?.content || message;
    } catch (error) {
        console.error("Groq API Error:", error.message);
        return message; // Fallback to original message if API fails
    }
};

// Function to send email
// const sendEmail = async (email, name, message) => {
//     try {
//         const expandedMessage = await expandMessage(message);

//         if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
//             throw new Error('Missing SMTP configuration');
//         }

//         const transporter = nodemailer.createTransport({
//             host: process.env.SMTP_HOST,
//             port: process.env.SMTP_PORT || 587,
//             secure: process.env.SMTP_PORT === '465', // Add secure option
//             auth: {
//                 user: process.env.SMTP_USER,
//                 pass: process.env.SMTP_PASS,
//             },
//         });

//         const confirmationLink = `${process.env.CONFIRMATION_BASE_URL}/confirm?email=${encodeURIComponent(email)}`;

//         const mailOptions = {
//             from: process.env.EMAIL_USER || "noreply@example.com",
//             to: email,
//             subject: "Your Message Has Been Expanded",
//             html: `
//                 <p>Hello ${name},</p>
//                 <p>Here is your expanded message:</p>
//                 <blockquote>${expandedMessage}</blockquote>
//                 <p>Click below to confirm:</p>
//                 <a href="${confirmationLink}" style="display:inline-block;padding:10px 20px;color:#fff;background:#007bff;text-decoration:none;">Confirm</a>
//             `,
//         };

//         return transporter.sendMail(mailOptions);
//     } catch (error) {
//         console.error('Email sending failed:', error);
//         throw new Error('Failed to send email: ' + error.message);
//     }
// };

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Limit each IP to 5 requests per minute
    message: "Too many requests, please try again later.",
});

// Root API test
app.get("/", (req, res) => {
    res.send("Backend is running...");
});

// Route to send email
app.post(
    "/send-email",
    limiter,
    [
        body("name").isString().trim().notEmpty(),
        body("email").isEmail(),
        body("message").isString().trim().notEmpty(),
    ],
    asyncHandler(async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, email, message } = req.body;
            await sendEmail(email, name, message);
            res.status(200).json({ message: "Email sent successfully!" });
        } catch (error) {
            console.error('Route error:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    })
);

// Route to expand a message
app.post(
    "/expand",
    limiter,
    [body("message").isString().trim().notEmpty()],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { message } = req.body;
        const expandedMessage = await expandMessage(message);
        res.json({ expandedMessage });
    })
);

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
