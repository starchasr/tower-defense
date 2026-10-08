export interface Achievement {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstblood', name: 'First Blood', desc: 'Slay your first enemy' },
  { id: 'century', name: 'Century', desc: 'Slay 100 enemies in one run' },
  { id: 'combo15', name: 'Chain Reaction', desc: 'Reach a 15 kill combo' },
  { id: 'bossdown', name: 'Giant Slayer', desc: 'Bring down a boss' },
  { id: 'veteran', name: 'Decorated', desc: 'Promote a tower to Veteran I' },
  { id: 'rich', name: 'War Chest', desc: 'Hold 1500 gold at once' },
  { id: 'campaign1', name: 'Road Opened', desc: 'Clear your first campaign level' },
  { id: 'allstars', name: 'Perfectionist', desc: 'Earn 3 stars on any level' },
  { id: 'endless10', name: 'Beyond the Wall', desc: 'Reach wave 40 in endless mode' },
  { id: 'storm', name: 'Stormcaller', desc: 'Lock the weather to storm' },
];

const KEY = 'nd_ach_v1';

export function loadAch(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, number>;
  } catch {
    // ignore
  }
  return {};
}

export function saveAch(a: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // ignore
  }
}

export function achName(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}
