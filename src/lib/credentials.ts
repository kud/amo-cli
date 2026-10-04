export type Credentials = { issuer: string; secret: string }

export const readCredentials = (
  env: Record<string, string | undefined>,
): Credentials | null => {
  const issuer = env["WEB_EXT_API_KEY"]
  const secret = env["WEB_EXT_API_SECRET"]
  return issuer && secret ? { issuer, secret } : null
}

export const requireCredentials = (
  env: Record<string, string | undefined>,
): Credentials => {
  const credentials = readCredentials(env)
  if (!credentials) {
    throw new Error("this needs WEB_EXT_API_KEY and WEB_EXT_API_SECRET")
  }
  return credentials
}
