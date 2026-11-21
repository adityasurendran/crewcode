


import { createHmac, createHash } from "node:crypto";

export async function resolveAwsSmSecret(ref: string): Promise<string> {
  const name = ref.replace(/^aws-sm:\/\//, "");
  const region = process.env.AWS_REGION ?? "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS creds missing — set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY or use env://");
  }

  
  const host = `secretsmanager.${region}.amazonaws.com`;
  const target = "secretsmanager.GetSecretValue";
  const body = JSON.stringify({ SecretId: name });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(body).digest("hex");
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/${region}/secretsmanager/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "secretsmanager");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const auth = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${host}/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Date": amzDate, Authorization: auth, "X-Amz-Target": target },
    body,
  });
  if (!res.ok) throw new Error(`aws-sm ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j: any = await res.json();
  const val = j.SecretString ?? j.SecretBinary;
  if (!val) throw new Error(`aws-sm: empty secret for ${name}`);
  return typeof val === "string" ? val : Buffer.from(val, "base64").toString("utf8");
}
