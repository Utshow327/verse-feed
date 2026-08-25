const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "versefeed.support@gmail.com",
        pass: "doklqswnbdxijcxb"
    }
});

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const payload = JSON.parse(event.body || "{}");
        const email = payload.email;
        const type = payload.type;
        const code = payload.code;
        const actionUrl = payload.actionUrl;
        const name = payload.name || "Friend";

        if (!email) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Email is required" }) };
        }

        let subject = "VerseFeed Notification";
        let bodyHtml = "";

        if (type === "verify-email") {
            subject = "Verify your VerseFeed account";
            let cta = "";
            if (code) {
                cta = '<div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(212,175,55,0.4); border-radius: 12px; padding: 18px 24px; text-align: center; margin: 24px 0;"><span style="font-size: 2rem; font-weight: 700; letter-spacing: 8px; color: #d4af37; font-family: monospace;">' + code + '</span><p style="margin: 8px 0 0 0; font-size: 0.85rem; color: #a8a29e;">This verification code expires in 15 minutes.</p></div>';
            } else if (actionUrl) {
                cta = '<div style="text-align: center; margin: 28px 0;"><a href="' + actionUrl + '" style="background: linear-gradient(135deg, #d4af37, #b8860b); color: #1c1917; text-decoration: none; padding: 14px 36px; border-radius: 28px; font-weight: 700; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(0,0,0,0.3); letter-spacing: 0.5px;">Verify Email Address</a></div>';
            }

            bodyHtml = '<p>Hello ' + name + ',</p><p>Welcome to <strong>VerseFeed</strong>. Please confirm your email address to sync your saved verses, custom albums, and notes securely across all your devices.</p>' + cta + '<p style="font-size: 0.85rem; color: #78716c; margin-top: 24px;">If you did not create a VerseFeed account, you can safely ignore this email.</p>';
        } else if (type === "reset-password") {
            subject = "Reset your VerseFeed password";
            let cta = "";
            if (actionUrl) {
                cta = '<div style="text-align: center; margin: 28px 0;"><a href="' + actionUrl + '" style="background: linear-gradient(135deg, #d4af37, #b8860b); color: #1c1917; text-decoration: none; padding: 14px 36px; border-radius: 28px; font-weight: 700; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(0,0,0,0.3); letter-spacing: 0.5px;">Reset Password</a></div>';
            } else if (code) {
                cta = '<div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(212,175,55,0.4); border-radius: 12px; padding: 18px 24px; text-align: center; margin: 24px 0;"><span style="font-size: 2rem; font-weight: 700; letter-spacing: 8px; color: #d4af37; font-family: monospace;">' + code + '</span><p style="margin: 8px 0 0 0; font-size: 0.85rem; color: #a8a29e;">This password reset code expires in 15 minutes.</p></div>';
            }

            bodyHtml = '<p>Hello ' + name + ',</p><p>We received a request to reset your VerseFeed account password. Click the button below to choose a new password:</p>' + cta + '<p style="font-size: 0.85rem; color: #78716c; margin-top: 24px;">If you did not request a password reset, you can safely ignore this email.</p>';
        }

        const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin: 0; padding: 20px; background-color: #141210; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #e7e5e4;"><div style="max-width: 520px; margin: 0 auto; background: #1f1d1b; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 32px 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"><div style="text-align: center; margin-bottom: 24px;"><h1 style="margin: 0; font-size: 1.8rem; font-weight: 700; color: #d4af37; letter-spacing: 1px;">VerseFeed</h1><p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #a8a29e;">Sacred Verses & Spiritual Mindfulness</p></div><div style="font-size: 1rem; line-height: 1.6; color: #d6d3d1;">' + bodyHtml + '</div><div style="border-top: 1px solid rgba(255,255,255,0.08); margin-top: 32px; padding-top: 18px; text-align: center; font-size: 0.75rem; color: #78716c; line-height: 1.5;"><p style="margin: 0;">🔒 <strong>Privacy Guarantee:</strong> VerseFeed never sends promotional spam. This transactional email was sent to securely manage your account.</p></div></div></body></html>';

        const mailOptions = {
            from: '"VerseFeed" <versefeed.support@gmail.com>',
            to: email,
            subject: subject,
            html: fullHtml
        };

        const info = await transporter.sendMail(mailOptions);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, messageId: info.messageId })
        };
    } catch (err) {
        console.error("Error sending email via Gmail SMTP:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || "Failed to send email" })
        };
    }
};
