# FoxLog - Privacy Policy

## Overview

FoxLog is a Chrome extension designed to help Salesforce developers view and analyze Apex debug logs. We are committed to protecting your privacy and being transparent about how the extension operates.

## Information We Collect

### Information Collected Locally

FoxLog operates **entirely within your browser** and **does not transmit any data to external servers**. The extension collects and stores the following information locally on your device:

- **Salesforce Session Tokens**: Used to authenticate API requests to your Salesforce organization
- **Salesforce Debug Logs**: Retrieved from your Salesforce organization for analysis
- **User Preferences**: Filter settings, search queries, and UI preferences (stored in browser's localStorage)
- **Cache Data**: Temporary storage of parsed logs and user lists to improve performance (expires after 30 seconds)

### Information Not Collected

FoxLog does **NOT**:
- Send any data to external servers or third parties
- Track your browsing activity
- Collect personal information beyond what's necessary for functionality
- Use analytics or telemetry services
- Store passwords or sensitive credentials

## How We Use Information

The information collected is used solely to:

1. **Authenticate with Salesforce**: Session tokens are used to make authorized API calls to retrieve debug logs from your Salesforce organization
2. **Display Debug Logs**: Parse and present Apex logs in a readable format
3. **Improve User Experience**: Cache frequently accessed data to reduce API calls and improve performance
4. **Remember Your Preferences**: Store filter settings and UI preferences for convenience

## Data Storage and Security

### Local Storage Only

All data is stored **locally in your browser** using:
- Chrome's localStorage API (for preferences)
- In-memory cache (for temporary data)
- No external databases or cloud storage

### Automatic Data Expiration

- Session tokens are cached for 30 seconds
- Parsed log data expires after 30 seconds
- Cache can be manually cleared at any time using the "Clear" button in the extension

### Security Measures

- All communication with Salesforce uses HTTPS encrypted connections
- Session tokens are never logged or exposed in plain text
- The extension only requests the minimum permissions necessary to function

## Third-Party Access

FoxLog does **NOT**:
- Share your data with third parties
- Sell or rent your information
- Use advertising networks
- Integrate with analytics services

## Salesforce Data Access

### Required Permissions

FoxLog requires the following Chrome permissions:

- **Host Permissions** (`*.salesforce.com`, `*.force.com`): Required to inject scripts and communicate with Salesforce pages
- **Cookies**: Required to retrieve session tokens for API authentication
- **Storage**: Required to save user preferences locally
- **Active Tab**: Required to interact with the current Salesforce page

### Salesforce API Usage

The extension makes API calls to your Salesforce organization to:
- Retrieve the list of Apex debug logs
- Fetch the content of individual logs
- Query user information and TraceFlags

**Important**: The extension can only access data from Salesforce organizations where you are already logged in. It uses your existing Salesforce session and respects all Salesforce security and permission settings.

## Your Rights and Controls

### Data Control

You have full control over your data:
- **Clear Cache**: Use the "Clear" button to immediately delete all cached data
- **Uninstall**: Removing the extension will delete all locally stored data
- **Browser Settings**: You can clear browser storage at any time through Chrome's settings

### Permissions Management

You can review and revoke permissions at any time:
1. Go to `chrome://extensions/`
2. Find FoxLog
3. Click "Details"
4. Manage permissions

## Children's Privacy

FoxLog is not intended for use by children under the age of 13. We do not knowingly collect information from children under 13.

## Changes to Privacy Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this policy. Continued use of FoxLog after changes constitutes acceptance of the updated policy.

## Open Source

FoxLog is open source software. You can review the complete source code to verify our privacy practices at:
- GitHub Repository: [https://github.com/MaximeClavel/FoxLog]

## Contact Information

If you have questions or concerns about this Privacy Policy or how FoxLog handles data, please contact us:

- **GitHub Issues**: [https://github.com/MaximeClavel/FoxLog/issues]
- **Email**: contact@foxlog.dev

## Compliance

FoxLog is designed to comply with:
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Chrome Web Store Developer Program Policies

## Data Protection Summary

| Category | Status | Details |
|----------|--------|---------|
| Data Transmission to External Servers | ❌ No | All data stays in your browser |
| Third-Party Data Sharing | ❌ No | No data shared with third parties |
| Analytics/Tracking | ❌ No | No tracking or analytics |
| Local Storage Only | ✅ Yes | All data stored locally |
| Encryption | ✅ Yes | HTTPS for all Salesforce communication |
| Open Source | ✅ Yes | Code publicly auditable |
| User Control | ✅ Yes | Full control over cached data |

## Your Consent

By installing and using FoxLog, you consent to this Privacy Policy and the data practices described herein.
