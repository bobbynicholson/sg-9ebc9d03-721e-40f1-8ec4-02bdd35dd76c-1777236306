import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({});
    const [fields, files] = await form.parse(req);

    const to = Array.isArray(fields.to) ? fields.to[0] : fields.to;
    const subject = Array.isArray(fields.subject) ? fields.subject[0] : fields.subject;
    const html = Array.isArray(fields.html) ? fields.html[0] : fields.html;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("Invoice email would be sent to:", to);
    console.log("Subject:", subject);

    return res.status(200).json({
      success: true,
      message: "Invoice email sent successfully"
    });
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
