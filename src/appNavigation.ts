export function shouldOpenConfiguration(pathname: string, accountName: string) {
  return pathname === "/" && !accountName.trim();
}

export function canStartAccountSync(accountName: string, isSyncing: boolean) {
  return Boolean(accountName.trim()) && !isSyncing;
}
