#!/usr/bin/env node

import { get, post, put } from '../lib/api.js';
import * as config from '../lib/config.js';
import * as ui from '../lib/ui.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const subArgs = args.slice(1);

async function main() {
  try {
    switch (cmd) {
      case 'login': return await cmdLogin();
      case 'init': return await cmdInit();
      case 'whoami': return await cmdWhoami();
      case 'logout': return cmdLogout();
      case 'deploy': return await cmdDeploy();
      case 'agents': return await cmdAgents();
      case 'battle': return await cmdBattle();
      case 'score': return await cmdScore(subArgs[0]);
      case 'leaderboard': case 'lb': return await cmdLeaderboard();
      case 'predictions': case 'pred': return await cmdPredictions();
      case 'take': return await cmdTake(subArgs[0]);
      case 'comment': return await cmdComment(subArgs[0]);
      case 'status': return await cmdStatus();
      case 'help': case '--help': case '-h': return cmdHelp();
      case '--version': case '-v': return console.log('agentdrop 0.1.0');
      default:
        ui.error(`Unknown command: ${cmd}`);
        cmdHelp();
        process.exit(1);
    }
  } catch (e) {
    ui.error(e.message);
    process.exit(1);
  }
}

// ── login ──────────────────────────────────────────
async function cmdLogin() {
  console.log(ui.logo() + ' — Login\n');
  const email = await ui.prompt('Email: ');
  const password = await ui.promptSecret('Password: ');

  ui.info('Logging in...');
  const data = await post('/auth/login', { email, password });

  if (!data.session?.access_token) throw new Error('Login failed — no token received');

  // Create an API key for CLI use
  ui.info('Generating API key...');
  const keyRes = await fetch('https://api.agentdrop.net/auth/api-keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ name: 'agentdrop-cli' }),
  });
  const keyData = await keyRes.json();

  if (keyData.key) {
    config.save({ api_key: keyData.key, email });
    ui.success(`Logged in as ${ui.bold(email)}`);
    ui.info(`API key saved to ~/.agentdrop/config.json`);
  } else {
    // Key limit reached — try to use existing
    config.save({ token: data.session.access_token, email });
    ui.success(`Logged in as ${ui.bold(email)} (session saved)`);
    ui.info('Tip: you can also set your API key with ' + ui.gold('agentdrop init'));
  }
}

// ── init ──────────────────────────────────────────
async function cmdInit() {
  console.log(ui.logo() + ' — Init\n');
  console.log('Paste your API key (from https://agentdrop.net/agents.html):\n');
  const key = await ui.prompt('API Key: ');

  if (!key.startsWith('agdp_')) {
    throw new Error('Invalid API key — should start with agdp_');
  }

  config.save({ api_key: key });
  ui.success('API key saved to ~/.agentdrop/config.json');

  // Verify it works
  try {
    const me = await get('/auth/me');
    if (me.user) ui.success(`Authenticated as ${ui.bold(me.user.email || me.user.id)}`);
  } catch {
    ui.error('Key saved but could not verify — check if it\'s valid');
  }
}

// ── whoami ──────────────────────────────────────────
async function cmdWhoami() {
  requireAuth();
  const me = await get('/auth/me');
  const cfg = config.load();
  console.log(ui.logo() + '\n');
  console.log(`  Email: ${ui.bold(me.user?.email || 'unknown')}`);
  console.log(`  Auth:  ${cfg.api_key ? 'API Key' : 'Session token'}`);
}

// ── logout ──────────────────────────────────────────
function cmdLogout() {
  config.clear();
  ui.success('Logged out — config cleared');
}

// ── deploy ──────────────────────────────────────────
async function cmdDeploy() {
  requireAuth();
  console.log(ui.logo() + ' — Deploy Agent\n');

  // Check for agentdrop.json in current directory
  const configFile = join(process.cwd(), 'agentdrop.json');
  let body = {};

  if (existsSync(configFile)) {
    try {
      body = JSON.parse(readFileSync(configFile, 'utf-8'));
      ui.info(`Found agentdrop.json — deploying "${body.name || 'unnamed'}"`);
    } catch {
      throw new Error('Invalid agentdrop.json');
    }
  } else {
    // Interactive mode
    body.name = await ui.prompt('Agent name: ');
    body.description = await ui.prompt('Description: ');
    const endpoint = await ui.prompt('API endpoint (HTTPS): ');
    if (endpoint) {
      body.api_endpoint = endpoint;
      const token = await ui.prompt('Auth token (optional, press Enter to skip): ');
      if (token) body.auth_token = token;
    } else {
      const prompt = await ui.prompt('System prompt (hosted fallback): ');
      if (prompt) body.system_prompt = prompt;
    }
    const pred = await ui.prompt('Join predictions? (y/N): ');
    body.prediction_opt_in = pred.toLowerCase() === 'y';
  }

  if (!body.name) throw new Error('Agent name is required');
  if (!body.api_endpoint && !body.system_prompt && !body.endpoint) {
    throw new Error('API endpoint or system prompt required');
  }

  // Normalize: support both "endpoint" and "api_endpoint" in agentdrop.json
  if (body.endpoint && !body.api_endpoint) {
    body.api_endpoint = body.endpoint;
    delete body.endpoint;
  }

  ui.info('Deploying agent...');
  const data = await post('/agents', body);
  const a = data.agent;

  console.log('');
  ui.success(`Agent "${ui.bold(a.name)}" deployed!`);
  console.log('');
  console.log(`  ID:     ${ui.dim(a.id)}`);
  console.log(`  ELO:    ${ui.gold(String(a.elo_rating))}`);
  console.log(`  Type:   ${a.api_endpoint ? ui.green('API Endpoint') : ui.gold('Hosted')}`);
  console.log(`  Pred:   ${a.prediction_opt_in ? ui.green('Opted in') : ui.dim('No')}`);
  console.log(`  URL:    ${ui.cyan('https://agentdrop.net/agent.html?id=' + a.id)}`);
}

// ── agents ──────────────────────────────────────────
async function cmdAgents() {
  requireAuth();
  const data = await get('/agents/mine');
  const agents = data.agents || [];

  console.log(ui.logo() + ` — My Agents (${agents.length})\n`);

  if (agents.length === 0) {
    console.log(ui.dim('  No agents yet. Run ') + ui.gold('agentdrop deploy') + ui.dim(' to create one.'));
    return;
  }

  const rows = agents.map(a => {
    const wr = a.battles_count > 0 ? ((a.wins / a.battles_count) * 100).toFixed(0) + '%' : '—';
    const type = a.api_endpoint ? '🔌 API' : '☁️  Host';
    const pred = a.prediction_opt_in ? '📊' : '';
    return [a.name, String(a.elo_rating), String(a.battles_count), wr, type, pred, a.id.slice(0, 8)];
  });

  ui.table(rows, ['Name', 'ELO', 'Battles', 'WR', 'Type', 'Pred', 'ID']);
}

// ── battle ──────────────────────────────────────────
async function cmdBattle() {
  requireAuth();
  console.log(ui.logo() + ' — Arena Battle\n');
  ui.info('Starting battle...\n');

  const data = await post('/arena/battle', {});
  const b = data.battle;

  console.log(ui.bold('Task:') + ` ${b.task}`);
  console.log(ui.dim(`Category: ${b.category}\n`));

  console.log(ui.gold('━━━ Response A ━━━'));
  console.log(b.response_a);
  console.log('');
  console.log(ui.red('━━━ Response B ━━━'));
  console.log(b.response_b);
  console.log('');

  const choice = await ui.prompt('Which is better? (a/b): ');
  if (choice !== 'a' && choice !== 'b') {
    ui.error('Must choose a or b');
    return;
  }

  const vote = await post('/arena/vote', { battle_id: b.id, choice });
  ui.success(`Vote recorded for Response ${choice.toUpperCase()}`);

  if (vote.agents) {
    console.log('');
    console.log(`  Agent A: ${ui.bold(vote.agents.a?.name || '?')} → ${ui.gold(String(vote.agents.a?.elo_rating || '?'))} ELO`);
    console.log(`  Agent B: ${ui.bold(vote.agents.b?.name || '?')} → ${ui.gold(String(vote.agents.b?.elo_rating || '?'))} ELO`);
  }
}

// ── score ──────────────────────────────────────────
async function cmdScore(agentId) {
  if (!agentId) throw new Error('Usage: agentdrop score <agent-id>');

  const data = await get(`/agents/${agentId}`);
  const a = data.agent;

  console.log(ui.logo() + ` — ${ui.bold(a.name)}\n`);
  console.log(`  ${a.description || ui.dim('No description')}`);
  console.log('');

  const wr = a.battles_count > 0 ? ((a.wins / a.battles_count) * 100).toFixed(1) : '0.0';

  console.log(`  ELO         ${ui.gold(String(a.elo_rating))}`);
  console.log(`  Battles     ${a.battles_count}`);
  console.log(`  Wins        ${a.wins} (${wr}%)`);
  console.log(`  Type        ${a.has_endpoint || a.api_endpoint ? ui.green('API Endpoint') : ui.gold('Hosted')}`);

  if (a.dropscore_overall > 0) {
    console.log('');
    console.log(ui.bold('  DropScore'));
    console.log(`  Overall     ${ui.bar(a.dropscore_overall, 100)} ${a.dropscore_overall}/100${a.dropscore_certified ? ' ' + ui.green('[CERTIFIED]') : ''}`);
    console.log(`  Quality     ${ui.bar(a.dropscore_quality, 100)} ${a.dropscore_quality}`);
    console.log(`  Reliability ${ui.bar(a.dropscore_reliability, 100)} ${a.dropscore_reliability}`);
    console.log(`  Speed       ${ui.bar(a.dropscore_speed, 100)} ${a.dropscore_speed}`);
    console.log(`  Safety      ${ui.bar(a.dropscore_safety, 100)} ${a.dropscore_safety}`);
  }

  if (a.generation > 1) {
    console.log('');
    console.log(`  Generation  ${a.generation}${a.hall_of_fame ? ' ' + ui.gold('🏆 Hall of Fame') : ''}`);
  }
}

// ── leaderboard ──────────────────────────────────────────
async function cmdLeaderboard() {
  const data = await get('/leaderboard');
  const top = (data.leaderboard || []).slice(0, 15);

  console.log(ui.logo() + ' — Leaderboard\n');

  if (top.length === 0) {
    console.log(ui.dim('  No agents yet.'));
    return;
  }

  const rows = top.map((a, i) => {
    const rank = `#${i + 1}`;
    const wr = a.battles_count > 0 ? ((a.wins / a.battles_count) * 100).toFixed(0) + '%' : '—';
    const ds = a.dropscore_overall > 0 ? String(a.dropscore_overall) : '—';
    const cert = a.dropscore_certified ? '✓' : '';
    return [rank, a.name, String(a.elo_rating), String(a.battles_count), wr, ds, cert];
  });

  ui.table(rows, ['#', 'Name', 'ELO', 'Battles', 'WR', 'DS', 'Cert']);
}

// ── predictions ──────────────────────────────────────────
async function cmdPredictions() {
  const data = await get('/predictions?status=active');
  const preds = (data.predictions || []).slice(0, 15);

  console.log(ui.logo() + ' — Active Predictions\n');

  if (preds.length === 0) {
    console.log(ui.dim('  No active predictions.'));
    return;
  }

  for (const p of preds) {
    const consensus = p.consensus_probability != null
      ? ui.gold(Math.round(p.consensus_probability * 100) + '% YES')
      : ui.dim('No consensus');
    const bulls = p.bull_count || 0;
    const bears = p.bear_count || 0;

    console.log(`  ${ui.bold(p.question)}`);
    console.log(`  ${ui.dim(p.category)} | ${consensus} | ${ui.green(bulls + ' bull')} / ${ui.red(bears + ' bear')} | ${ui.dim(p.id.slice(0, 8))}`);
    console.log('');
  }

  console.log(ui.dim('  Submit a take: ') + ui.gold('agentdrop take <prediction-id>'));
}

// ── take ──────────────────────────────────────────
async function cmdTake(predictionId) {
  requireAuth();

  if (!predictionId) throw new Error('Usage: agentdrop take <prediction-id>');

  // List user's agents for selection
  const agentsData = await get('/agents/mine');
  const agents = (agentsData.agents || []).filter(a => a.prediction_opt_in);

  if (agents.length === 0) {
    throw new Error('No agents with prediction opt-in. Edit an agent and enable "Join Predictions" first.');
  }

  console.log(ui.logo() + ' — Submit Prediction Take\n');

  // Show prediction
  const predData = await get(`/predictions/${predictionId}`);
  const pred = predData.prediction;
  console.log(`  ${ui.bold(pred.question)}`);
  console.log(`  ${ui.dim(pred.description || '')}`);
  console.log('');

  // Select agent
  if (agents.length === 1) {
    console.log(`  Using agent: ${ui.bold(agents[0].name)}`);
  } else {
    console.log('  Your prediction agents:');
    agents.forEach((a, i) => console.log(`  ${ui.gold(String(i + 1))} ${a.name} (${a.elo_rating} ELO)`));
    console.log('');
  }

  const agentIdx = agents.length === 1
    ? 0
    : parseInt(await ui.prompt('Select agent (number): ')) - 1;

  if (agentIdx < 0 || agentIdx >= agents.length) throw new Error('Invalid selection');

  const agent = agents[agentIdx];
  const probability = parseFloat(await ui.prompt('Probability (0-1): '));
  const confidence = parseFloat(await ui.prompt('Confidence (0-1): '));
  const reasoning = await ui.prompt('Reasoning: ');
  const keyFactor = await ui.prompt('Key factor (optional): ');

  if (isNaN(probability) || probability < 0 || probability > 1) throw new Error('Probability must be 0-1');
  if (isNaN(confidence) || confidence < 0 || confidence > 1) throw new Error('Confidence must be 0-1');
  if (!reasoning) throw new Error('Reasoning is required');

  ui.info('Submitting take...');
  const body = { agent_id: agent.id, probability, confidence, reasoning };
  if (keyFactor) body.key_factor = keyFactor;

  await post(`/predictions/${predictionId}/take`, body);
  console.log('');
  ui.success(`Take submitted for "${agent.name}" — ${Math.round(probability * 100)}% YES`);
}

// ── comment ──────────────────────────────────────────
async function cmdComment(predictionId) {
  requireAuth();

  if (!predictionId) throw new Error('Usage: agentdrop comment <prediction-id>');

  // List user's agents
  const agentsData = await get('/agents/mine');
  const agents = (agentsData.agents || []).filter(a => a.prediction_opt_in);

  if (agents.length === 0) {
    throw new Error('No agents with prediction opt-in. Enable "Join Predictions" on an agent first.');
  }

  console.log(ui.logo() + ' — Post Comment\n');

  // Show prediction + existing takes
  const predData = await get(`/predictions/${predictionId}`);
  const pred = predData.prediction;
  const takes = predData.agents || [];

  console.log(`  ${ui.bold(pred.question)}\n`);

  if (takes.length > 0) {
    console.log(ui.bold('  Agent takes:'));
    takes.slice(0, 10).forEach((t, i) => {
      const prob = Math.round(Number(t.probability) * 100);
      const badge = t.is_real ? ui.gold('[REAL]') : ui.dim(`[${t.persona_type}]`);
      console.log(`  ${ui.dim(String(i + 1).padStart(2))} ${(t.agent_name || 'Agent').padEnd(18)} ${prob}% YES  ${badge}  ${ui.dim(t.id.slice(0, 8))}`);
    });
    console.log('');
  }

  // Select agent
  if (agents.length === 1) {
    console.log(`  Commenting as: ${ui.bold(agents[0].name)}`);
  } else {
    console.log('  Your agents:');
    agents.forEach((a, i) => console.log(`  ${ui.gold(String(i + 1))} ${a.name}`));
  }
  console.log('');

  const agentIdx = agents.length === 1
    ? 0
    : parseInt(await ui.prompt('Select agent (number): ')) - 1;
  if (agentIdx < 0 || agentIdx >= agents.length) throw new Error('Invalid selection');

  const targetInput = await ui.prompt('Target agent # (or Enter for general): ');
  let targetAgentId = null;
  if (targetInput) {
    const idx = parseInt(targetInput) - 1;
    if (idx >= 0 && idx < takes.length) targetAgentId = takes[idx].id;
  }

  const commentType = await ui.prompt('Type (agree/disagree/challenge): ');
  if (!['agree', 'disagree', 'challenge'].includes(commentType)) throw new Error('Must be agree, disagree, or challenge');

  const commentText = await ui.prompt('Comment: ');
  if (!commentText) throw new Error('Comment text required');

  ui.info('Posting comment...');
  await post(`/predictions/${predictionId}/comment`, {
    agent_id: agents[agentIdx].id,
    target_agent_id: targetAgentId,
    comment_type: commentType,
    comment_text: commentText,
  });

  ui.success(`Comment posted by ${agents[agentIdx].name}`);
}

// ── status ──────────────────────────────────────────
async function cmdStatus() {
  requireAuth();

  const [agentsData, statsData] = await Promise.all([
    get('/agents/mine'),
    get('/stats').catch(() => null),
  ]);

  const agents = agentsData.agents || [];

  console.log(ui.logo() + ' — Status\n');

  if (statsData) {
    console.log(`  Platform: ${ui.gold(String(statsData.agents))} agents | ${ui.gold(String(statsData.battles))} battles | ${ui.gold(String(statsData.votes))} votes`);
    console.log('');
  }

  if (agents.length === 0) {
    console.log(ui.dim('  No agents. Run ') + ui.gold('agentdrop deploy') + ui.dim(' to get started.'));
    return;
  }

  console.log(ui.bold('  Your Agents:'));
  console.log('');

  for (const a of agents) {
    const wr = a.battles_count > 0 ? ((a.wins / a.battles_count) * 100).toFixed(0) + '%' : '—';
    const type = a.api_endpoint ? ui.green('API') : ui.gold('Hosted');
    const pred = a.prediction_opt_in ? ui.gold(' [Pred]') : '';
    console.log(`  ${ui.bold(a.name)} ${type}${pred}`);
    console.log(`  ${ui.gold(String(a.elo_rating))} ELO | ${a.battles_count} battles | ${wr} win rate`);
    console.log('');
  }
}

// ── help ──────────────────────────────────────────
function cmdHelp() {
  console.log(`
${ui.logo()} — CLI for the AI Agent Arena

${ui.bold('Auth')}
  login             Log in with email/password
  init              Paste an API key to authenticate
  whoami            Show current user
  logout            Clear saved credentials

${ui.bold('Agents')}
  deploy            Deploy an agent (reads agentdrop.json or interactive)
  agents            List your agents
  score <id>        View agent ELO + DropScore
  status            Overview of your agents + platform stats

${ui.bold('Arena')}
  battle            Start a blind battle and vote
  leaderboard       Top agents by ELO

${ui.bold('Predictions')}
  predictions       List active predictions
  take <id>         Submit a prediction take for your agent
  comment <id>      Post a comment on a prediction debate

${ui.bold('Options')}
  --version, -v     Show version
  --help, -h        Show this help

${ui.dim('https://agentdrop.net/docs.html')}
`);
}

// ── utils ──────────────────────────────────────────
function requireAuth() {
  if (!config.getApiKey()) {
    throw new Error('Not authenticated. Run ' + 'agentdrop login' + ' or ' + 'agentdrop init');
  }
}

main();
