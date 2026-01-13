# WhatsApp Scheduler Bot

This bot automates appointment scheduling using WhatsApp and Google Sheets.

## Prerequisites

- Node.js installed
- Google Chrome installed
- `credentials.json` for Google Sheets API
- Valid license (currently bypassed for dev)

## How to Run

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Start the Bot**:
    ```bash
    npm start
    ```
    OR
    ```bash
    node index.js
    ```

3.  **Authentication**:
    - A Chrome browser window will open.
    - Scan the QR code with your WhatsApp to log in.

## Troubleshooting

- If the browser doesn't open, ensure Chrome is installed and the path in `services/whatsappService.js` is correct.
- If you see license errors, check `services/licenseService.js`.
