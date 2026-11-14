// Server-only VAPID settings. These fallback credentials are embedded for temporary push testing.
const FALLBACK_PUBLIC_KEY = "BN4nPHlvk62kCk7Y-rV82ts0wLG2WxBr0AYUh70NUOECYEcPCH73KgWuyyMq5Ata7_5DCWfbXOJU1N3f0v88b4w";
const FALLBACK_PRIVATE_KEY = "opDlmPDEtJQ_NeQ_p4uyjpgvS3pKDf8raumidfGwVow";
const FALLBACK_SUBJECT = "mailto:support@cateringms.com";

export function getVapidConfig() {
  const envPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
  const envPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
  const publicKey = envPublicKey && envPrivateKey ? envPublicKey : FALLBACK_PUBLIC_KEY;
  const privateKey = envPublicKey && envPrivateKey ? envPrivateKey : FALLBACK_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || FALLBACK_SUBJECT;
  return { publicKey, privateKey, subject };
}
