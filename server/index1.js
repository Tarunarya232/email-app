import dotenv from 'dotenv';
import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import nodemailer from "nodemailer";
import asyncHandler from "express-async-handler";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq API Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Create Nodemailer transporter with Ethereal Email credentials
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Email from .env file
        pass: process.env.EMAIL_APP_PASSWORD // App password from .env file
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Rate Limiter to prevent abuse
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Limit each IP to 5 requests per minute
    message: "Too many requests, please try again later.",
});

// Message Expansion Function
async function expandMessage(message) {
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "Expand the given message professionally and concisely. Remove any introductory phrases. Provide a clear, direct expansion that adds context and details." 
                },
                { 
                    role: "user", 
                    content: message
                }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
        });

        // Clean up the response by removing any leading/trailing whitespace 
        // and introductory phrases
        const expandedMessage = chatCompletion.choices[0]?.message?.content
            .replace(/^(Here is an expanded version of the message:\n\n)/i, '')
            .replace(/^(Here's an expanded version:\n\n)/i, '')
            .trim();

        return expandedMessage || message;
    } catch (error) {
        console.error("Groq API Expansion Error:", error);
        throw new Error(`Message expansion failed: ${error.message}`);
    }
}

// // Function to send email
// const sendEmail = async (email, name, message) => {
//     try {
//         // Expand the message using Groq API
//         const expandedMessage = await expandMessage(message);

//         // Generate a sample confirmation link
//         const confirmationLink = `https://example.com/confirm?email=${encodeURIComponent(email)}`;

//         // Prepare mail options
//         const mailOptions = {
//             from: '"Message Expansion Service" <audie29@ethereal.email>',
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

//         // Send email
//         const info = await transporter.sendMail(mailOptions);
        
//         // Log the preview URL for testing
//         console.log('Email Preview URL:', nodemailer.getTestMessageUrl(info));

//         return info;
//     } catch (error) {
//         console.error('Email sending failed:', error);
//         throw new Error('Failed to send email: ' + error.message);
//     }
// };
// Function to send email
const sendEmail = async (email, name, message) => {
    try {
        // Expand the message using Groq API
        const expandedMessage = await expandMessage(message);

        // Generate a sample confirmation link
        const confirmationLink = `https://example.com/confirm?email=${encodeURIComponent(email)}`;

        // Prepare mail options
        const mailOptions = {
            from: `"Message Expansion Service" <${process.env.EMAIL_USER}>`, // Use environment variable
            to: email,
            subject: "Your Message Has Been Expanded",
            html: `
                <p>Hello ${name},</p>
                <p>Here is your expanded message:</p>
                <blockquote>${expandedMessage}</blockquote>
                <p>Click below to confirm:</p>
                <a href="${confirmationLink}" style="display:inline-block;padding:10px 20px;color:#fff;background:#007bff;text-decoration:none;">Confirm</a>
            `,
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        
        return info;
    } catch (error) {
        console.error('Email sending failed:', error);
        throw new Error('Failed to send email: ' + error.message);
    }
};

app.set('trust proxy', 1);


// Message Expansion Route
app.post(
    "/expand-message",
    limiter,
    [
        body("message")
            .isString()
            .trim()
            .notEmpty()
            .withMessage("Message must be a non-empty string")
    ],
    asyncHandler(async (req, res) => {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { message } = req.body;
            const expandedMessage = await expandMessage(message);
            
            res.json({ 
                original: message,
                expanded: expandedMessage 
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    })
);

// Email Sending Route
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
            const emailResult = await sendEmail(email, name, message);
            
            res.status(200).json({ 
                message: "Email sent successfully!",
                previewUrl: nodemailer.getTestMessageUrl(emailResult)
            });
        } catch (error) {
            console.error('Route error:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    })
);

// Root route
app.get("/", (req, res) => {
    res.send("Message Expansion and Email API is running...");
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export { 
    app, 
    expandMessage, 
    sendEmail 
};