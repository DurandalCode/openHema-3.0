export function isPreprodModeEnabled(): boolean {
  return process.env.PREPROD_MODE === "true";
}

export function isRegistrationDisabled(): boolean {
  return process.env.REGISTRATION_DISABLED === "true";
}
