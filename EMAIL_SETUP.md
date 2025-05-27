# Email Setup Instructions

This application includes email functionality to send test invitations to candidates. To enable email sending, you need to configure SMTP settings.

## Environment Variables

Add the following environment variables to your `.env` file in the `server` directory:

```bash
# Email Configuration
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=your-email@gmail.com
```

## Gmail Setup (Recommended)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this app password as `SMTP_PASSWORD`

## Other Email Providers

### Outlook/Hotmail
```bash
SMTP_SERVER=smtp-mail.outlook.com
SMTP_PORT=587
```

### Yahoo
```bash
SMTP_SERVER=smtp.mail.yahoo.com
SMTP_PORT=587
```

### Custom SMTP
Configure according to your email provider's SMTP settings.

## Testing Email Functionality

1. Set up the environment variables
2. Restart the server
3. Create a test and assign candidates
4. Use the "Send Email Invitations" button in the Manage Candidates modal

## Email Content

The email will include:
- Assessment invitation message
- Test name
- Deadline information
- Secure access link that expires on the deadline
- Instructions for the candidate

## Troubleshooting

- **"SMTP credentials not configured"**: Check that all required environment variables are set
- **Authentication failed**: Verify your email and app password are correct
- **Connection refused**: Check SMTP server and port settings
- **Emails not received**: Check spam/junk folders

## Security Notes

- Access tokens are generated uniquely for each candidate and test instance
- Tokens expire automatically on the deadline
- Tokens are marked as "used" after first access to prevent reuse 