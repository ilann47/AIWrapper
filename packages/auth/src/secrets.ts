import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export class SecretBox {
  constructor(private readonly key: Buffer) { if (key.length !== 32) throw new Error("Secret encryption key must contain 32 bytes"); }
  static fromBase64(value: string): SecretBox { return new SecretBox(Buffer.from(value, "base64")); }
  encrypt(plainText: string): string { const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",this.key,iv), encrypted=Buffer.concat([cipher.update(plainText,"utf8"),cipher.final()]); return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join("."); }
  decrypt(envelope: string): string { const [version,iv,tag,payload]=envelope.split("."); if(version!=="v1"||!iv||!tag||!payload) throw new Error("Invalid secret envelope"); const decipher=createDecipheriv("aes-256-gcm",this.key,Buffer.from(iv,"base64url")); decipher.setAuthTag(Buffer.from(tag,"base64url")); return Buffer.concat([decipher.update(Buffer.from(payload,"base64url")),decipher.final()]).toString("utf8"); }
}
