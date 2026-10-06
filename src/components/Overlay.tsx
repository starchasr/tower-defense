import type { Game } from '../game/engine';
import type { UiSnapshot } from '../game/types';
import { DIFFICULTIES, FINAL_WAVE } from '../game/config';
import type { DifficultyId } from '../game/types';

export function Overlay({ ui, game }: { ui: UiSnapshot; game: Game }) {
  if (ui.state === 'playing') return null;

  if (ui.state === 'paused') {
    return (
      <div className="overlay">
        <h2>Paused</h2>
        <button className="primary big" onClick={() => game.togglePause()}>Resume</button>
      </div>
    );
  }

  if (ui.state === 'stories' && ui.campaign) {
    return (
      <div className="overlay">
        <h2>Campaign</h2>
        <p className="tagline">Choose your story — 10 levels each, each one harder than the last</p>
        <div className="story-grid">
          {ui.campaign.stories.map(s => (
            <button key={s.id} className="story-card" style={{ borderColor: s.color }} onClick={() => game.selectStory(s.id)}>
              <div className="story-name" style={{ color: s.color, textShadow: `0 0 18px ${s.color}66` }}>{s.name}</div>
              <div className="story-blurb">{s.blurb}</div>
              <div className="story-progress" style={{ color: s.color }}>{s.cleared >= 10 ? 'CLEARED' : `${s.cleared} / 10 cleared`}</div>
            </button>
          ))}
        </div>
        <button onClick={() => game.campaignBack()}>Back</button>
      </div>
    );
  }

  if (ui.state === 'levels' && ui.campaign) {
    const story = ui.campaign.stories.find(s => s.id === ui.campaign?.selStory);
    return (
      <div className="overlay">
        <h2 style={{ color: story?.color, textShadow: `0 0 24px ${story?.color}88` }}>{story?.name}</h2>
        <p className="tagline">Select deployment — each level is 3 waves</p>
        <div className="level-grid">
          {ui.campaign.levels.map((lv, i) => (
            <button
              key={i}
              className={`level-node ${lv.cleared ? 'cleared' : ''}`}
              disabled={lv.locked}
              onClick={() => game.openLevel(i)}
            >
              <span className="level-num">{i + 1}</span>
              <span className="level-name">{lv.locked ? '???' : lv.name}</span>
              {lv.cleared && <span className="level-check">✓</span>}
            </button>
          ))}
        </div>
        <div className="row gap center">
          <button onClick={() => game.storiesBack()}>Stories</button>
        </div>
      </div>
    );
  }

  if (ui.state === 'briefing' && ui.campaign) {
    const story = ui.campaign.stories.find(s => s.id === ui.campaign?.selStory);
    return (
      <div className="overlay">
        <p className="tagline" style={{ color: story?.color }}>{story?.name} · Level {ui.campaign.levelNum} of 10</p>
        <h2>{ui.campaign.levelName}</h2>
        <p className="sub">{ui.campaign.intro}</p>
        <button className="primary big" onClick={() => game.startLevel()}>Deploy</button>
        <button onClick={() => game.levelsBack()}>Back</button>
      </div>
    );
  }

  if (ui.state === 'menu') {
    return (
      <div className="overlay">
        <h2>NEON DEFENSE</h2>
        <p className="tagline">Advanced tower defense</p>
        {ui.highScore > 0 && <p className="highscore">High score: {ui.highScore}</p>}
        <div className="diff-row">
          {(Object.keys(DIFFICULTIES) as DifficultyId[]).map(d => (
            <button key={d} className={ui.difficulty === d ? 'on' : ''} onClick={() => game.setDifficulty(d)}>
              {DIFFICULTIES[d].label}
            </button>
          ))}
        </div>
        <div className="row gap center">
          <button className="primary big" onClick={() => game.start()}>Skirmish</button>
          <button className="big" onClick={() => game.openCampaign()}>Campaign</button>
        </div>
        <ul className="rules">
          <li>Buy towers (hotkeys 1–9) and click the map to place them.</li>
          <li>Click a tower to upgrade, retarget (Q/W/E/R) or sell it (X).</li>
          <li>Towers earn veteran stars (+5% damage each) as they rack up kills.</li>
          <li>Waves carry modifiers — Swift, Fortified, Regenerating, Golden.</li>
          <li>Cast Airstrike (A), Cryo Blast (S), Overdrive (D), Repair (F) and Gold Rush (G).</li>
          <li>Call waves early for bonus gold — unspent gold earns 4% interest.</li>
          <li>Cannons can't hit air; missiles are anti-air only; amp pylons buff nearby towers.</li>
          <li>Vaults pay gold after every wave — invest early, harvest late.</li>
          <li>Phantoms periodically cloak — untargetable and immune while phased.</li>
          <li>Bosses slam the ground, stunning towers caught in the shockwave.</li>
          <li>Wreckers channel a jamming beam that disables nearby towers.</li>
          <li>Frost-chilled enemies go brittle: +15% damage from every source.</li>
          <li>Chain kills to build a score combo — a leak resets it.</li>
          <li>From wave 12, elites can appear with random buffs — and bigger bounties.</li>
        </ul>
      </div>
    );
  }

  if (ui.state === 'gameover') {
    return (
      <div className="overlay bad">
        <h2>Base Destroyed</h2>
        <p>You survived {Math.max(0, ui.wave - 1)} waves · Score {ui.score}</p>
        {ui.score >= ui.highScore && ui.score > 0 && <p className="highscore">New high score!</p>}
        <div className="row gap center">
          {ui.campaignOn && <button className="primary big" onClick={() => game.retryLevel()}>Retry Level</button>}
          {!ui.campaignOn && <button className="primary big" onClick={() => game.start()}>Try Again</button>}
          {ui.campaignOn && <button className="big" onClick={() => game.toLevelSelect()}>Level Select</button>}
        </div>
      </div>
    );
  }

  if (ui.campaignResult) {
    const r = ui.campaignResult;
    return (
      <div className="overlay good">
        <h2>{r.clearedAll ? 'Story Complete' : 'Level Cleared'}</h2>
        <p>{r.story} · {r.level}</p>
        <p className="sub">{r.outro}</p>
        <p>Score {ui.score} · +{ui.money} unspent gold banked</p>
        {ui.score >= ui.highScore && ui.score > 0 && <p className="highscore">New high score!</p>}
        <div className="row gap center">
          {r.hasNext && <button className="primary big" onClick={() => game.nextLevel()}>Next Level</button>}
          <button className="big" onClick={() => game.toLevelSelect()}>Level Select</button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay good">
      <h2>Victory</h2>
      <p>All {FINAL_WAVE} waves cleared · Score {ui.score}</p>
      <p className="sub">+{ui.money} unspent gold banked as score</p>
      {ui.score >= ui.highScore && ui.score > 0 && <p className="highscore">New high score!</p>}
      <div className="row gap center">
        <button className="primary big" onClick={() => game.continueEndless()}>Endless Mode</button>
        <button className="big" onClick={() => game.start()}>Play Again</button>
      </div>
    </div>
  );
}
