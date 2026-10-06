export interface CampaignLevel {
  name: string;
  intro: string;
  outro: string;
}

export interface Story {
  id: string;
  name: string;
  blurb: string;
  color: string;
  levels: CampaignLevel[];
}

export const WAVES_PER_LEVEL = 3;

export function levelWaveBase(levelIdx: number): number {
  return levelIdx * WAVES_PER_LEVEL + 1;
}

export const STORIES: Story[] = [
  {
    id: 'ember',
    name: 'EMBER ROAD',
    blurb: 'The Ashen Horde marches down the old caravan road. Light the beacons and hold every mile.',
    color: '#fb923c',
    levels: [
      { name: 'First Blood', intro: 'Scouts report the vanguard crossing the western pass. The road is yours to keep — or lose.', outro: 'The vanguard breaks. Word spreads: someone is holding the road.' },
      { name: 'The Waystation', intro: 'Refugees crowd the old waystation. You cannot retreat — they have nowhere to go.', outro: 'The waystation stands. Fires burn warm again behind your lines.' },
      { name: 'Ashen Fields', intro: 'Cinder drifts like snow over the fields. The horde burns everything it cannot take.', outro: 'The fields are saved. Ash will feed next spring\'s harvest.' },
      { name: 'River Gate', intro: 'A boss leads the column across the river gate. Bridges out, no crossing for them.', outro: 'The river gate holds. The boss\'s skull now hangs above it.' },
      { name: 'Burnside', intro: 'They torch the far bank. Smoke blinds the gunners — you will be fighting by glow.', outro: 'Burnside survives the burning. The road east is open.' },
      { name: 'The Toll', intro: 'Bandits turned horde demand a toll in blood. Every cart must pass.', outro: 'The toll is paid — in ash. The carts roll on.' },
      { name: 'Emberfall', intro: 'A second boss rises from the ember pits. The sky itself glows wrong.', outro: 'Emberfall gutters out. Even the pits have gone quiet.' },
      { name: 'Cinder Keep', intro: 'The last stone keep on the road. If it falls, the whole valley burns.', outro: 'Cinder Keep endures. Banners fly from its highest tower.' },
      { name: 'The Last Mile', intro: 'One mile of road between the horde and the city. Everything they have left comes here.', outro: 'The last mile holds. The city drums hear the news.' },
      { name: 'Road\'s End', intro: 'Three bosses march on Road\'s End, where the horde began. End it where it started.', outro: 'Road\'s End is the horde\'s end. The Ember Road is free.' },
    ],
  },
  {
    id: 'frost',
    name: 'FROSTFALL',
    blurb: 'Winter marches down from the peaks and it does not stop for walls. Melt it.',
    color: '#7dd3fc',
    levels: [
      { name: 'Thaw', intro: 'First scouts of the Frostfall crest the ridge. Your braziers are lit, guns warm.', outro: 'The thaw begins. Water runs where ice marched.' },
      { name: 'Cold Open', intro: 'The cold open came early this year. The pass freezes in a single night.', outro: 'The pass stays open. Caravans sing your gunners\' names.' },
      { name: 'Whiteout', intro: 'Whiteout conditions. You will hear them before you see them.', outro: 'The whiteout lifts. The drifts are full of broken frost.' },
      { name: 'Icebreak', intro: 'They froze the river solid to walk across. A boss walks point, cracking the ice like thunder.', outro: 'The icebreaker falls. Spring comes up through the cracks.' },
      { name: 'Rime', intro: 'Rime-frost armors their hides. Every shot counts double against the crust.', outro: 'The rime cracks and shatters. Underneath: nothing but cold.' },
      { name: 'Deep Freeze', intro: 'Deep freeze. Metal sticks to skin, oil goes to tar, and still they come.', outro: 'The deep freeze breaks. Your guns never stopped running hot.' },
      { name: 'Glacier Gate', intro: 'The glacier gate — carved by hand a thousand years ago to keep this exact thing out.', outro: 'The gate holds like it always has. Your names join the carvings.' },
      { name: 'Frostbite', intro: 'Frostbite takes fingers, then triggers, then towers. Keep the braziers close.', outro: 'Frostbite is beaten back. The infirmary is warm and full.' },
      { name: 'White Silence', intro: 'No wind. No birds. White silence. They are already close.', outro: 'The silence ends with their advance. The peaks are loud with victory.' },
      { name: 'Longest Night', intro: 'The longest night. Three bosses and no dawn until it is done.', outro: 'Dawn comes. The longest night is over — the peaks are just peaks again.' },
    ],
  },
  {
    id: 'void',
    name: 'VOIDFRONT',
    blurb: 'Something ancient stirs beyond the rift. The path spirals inward — so does the end of everything. Close it.',
    color: '#c084fc',
    levels: [
      { name: 'Breach', intro: 'The rift breathes and the first things crawl out. The spiral path runs to the heart of the valley.', outro: 'The breach is contained. For now the rift only whispers.' },
      { name: 'The Shallows', intro: 'The shallows of the void are the thick of it here. Reality wears thin underfoot.', outro: 'The shallows are cleared. The stars come back out.' },
      { name: 'Null Field', intro: 'A null field deadens your guns\' voices. Shots still fly — nothing echoes.', outro: 'The null field collapses. Sound returns like a flood.' },
      { name: 'Echoes', intro: 'Echoes of things that never lived pour from the rift, a boss wearing a crown of static.', outro: 'The echoes fade. The static crown lies in the dust.' },
      { name: 'Riftwarden', intro: 'You are the Riftwarden now. The title comes with the whole valley to defend.', outro: 'The Riftwarden holds. The title weighs less than the duty.' },
      { name: 'The Maw', intro: 'The maw opens wide enough to swallow the spire whole.', outro: 'The maw is shut. The spire stands against the sky.' },
      { name: 'Eventide', intro: 'Eventide — the hour the rift is strongest. Hold until the hour turns.', outro: 'The hour turns. Eventide passes like a fever.' },
      { name: 'Null Heart', intro: 'The null heart beats at the center of the spiral. Every pulse sends them faster.', outro: 'The null heart is cracked. It beats slower now, and afraid.' },
      { name: 'Voidcaller', intro: 'The Voidcaller itself stands at the rift\'s edge, calling its children home to war.', outro: 'The Voidcaller is unmade. The calling stops mid-word.' },
      { name: 'Riftclosed', intro: 'Three ancient ones, one rift, one chance. Close it forever.', outro: 'The rift is closed. The valley is only a valley again.' },
    ],
  },
];

export function getStory(id: string): Story {
  return STORIES.find(s => s.id === id) ?? STORIES[0];
}

const KEY = 'nd_campaign_v1';

export function loadProgress(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, number>;
  } catch {
    // ignore
  }
  return {};
}

export function saveProgress(p: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}
