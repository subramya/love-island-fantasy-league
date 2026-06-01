const ADMIN_PASSWORD = "ramya";

export function isAdminUnlocked() {
  return false;
}

export function unlockAdmin(password: string) {
  return password === ADMIN_PASSWORD;
}

export function lockAdmin() {
  return;
}
