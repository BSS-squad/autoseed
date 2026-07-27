import type { CombinedSnapshot, ExporterServerSnapshot } from '../types';

export function getServerSelectionKey(
  server: ExporterServerSnapshot | null | undefined
): string {
  if (!server) return '';
  return `${server.sourceUrl}::${server.id}::${server.code}`;
}

export function isSameServer(
  left: ExporterServerSnapshot | null | undefined,
  right: ExporterServerSnapshot | null | undefined
): boolean {
  return Boolean(
    left &&
      right &&
      getServerSelectionKey(left) === getServerSelectionKey(right)
  );
}

export function findServerBySelectionKey(
  snapshot: CombinedSnapshot,
  selectionKey: string
): ExporterServerSnapshot | null {
  if (!selectionKey) return null;
  return (
    snapshot.servers.find(
      (server) => getServerSelectionKey(server) === selectionKey
    ) || null
  );
}
