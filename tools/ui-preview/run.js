// Аппын вэб build-ийг утасны хэмжээгээр нээж, Supabase-ийн хариуг жишээ өгөгдлөөр орлуулж, дэлгэц бүрийн зураг авна.
// Хэрэглээ: node run.js <webdist> <outdir> [name ...]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const F = require('./fixtures');

const DIST = process.argv[2] || '/tmp/webdist';
const OUT = process.argv[3] || '/home/claude/shots/before';
const ONLY = process.argv.slice(4);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
const USER = { id: F.ME, aud: 'authenticated', role: 'authenticated', email: 'demo@together.mn', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: F.iso(-30 * F.day) };
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: F.ME, role: 'authenticated', exp: EXP, aud: 'authenticated' })}.sig`;
const SESSION = { access_token: TOKEN, refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600 * 24 * 30, expires_at: EXP, user: USER };

function eqParam(params, col) {
  const v = params.get(col);
  return v && v.startsWith('eq.') ? v.slice(3) : null;
}

// Хүснэгт/RPC бүрт хариу.
function respond(table, params, method, body) {
  const sel = params.get('select') || '';
  const id = eqParam(params, 'id');
  switch (table) {
    case 'profiles': {
      const p = F.people[id || F.ME];
      return p ? [p] : [];
    }
    case 'user_progress': return [{ total_xp: 520, current_level: 3, current_streak: 5, longest_streak: 12 }];
    case 'goals': {
      const gid = eqParam(params, 'id');
      return gid ? F.goals.filter((g) => g.id === gid) : F.goals;
    }
    case 'goal_completions': return F.doneGoals.map((goal_id) => ({ goal_id }));
    case 'challenge_participants':
      if (sel.includes('challenges(')) return [F.challenge, ...F.verifiedChallenges].map((c) => ({ challenges: c }));
      return [{ user_id: 'u3', joined_at: F.iso(-11 * F.day), profiles: { display_name: 'Мөнхсайхан' } }, { user_id: F.ME, joined_at: F.iso(-10 * F.day), profiles: { display_name: 'Анараа' } }];
    case 'challenge_checkins':
      if (params.get('checked_on')) return [];
      return [];
    case 'challenges':
      if (id) return [F.challenge, ...F.verifiedChallenges].filter((c) => c.id === id);
      return eqParam(params, 'group_id') === 'g2' ? [F.challenge, ...F.verifiedChallenges] : [];
    case 'activities':
      return eqParam(params, 'challenge_id') === 'c2' ? F.activities : [];
    case 'session_rsvps':
      if (sel.includes('group_sessions(')) return [{ group_sessions: F.session }];
      return [];
    case 'group_sessions':
      if (id) return [F.session];
      return eqParam(params, 'group_id') === 'g1' ? [F.session] : [];
    case 'categories': return F.categories;
    case 'user_interests': return ['programming', 'language', 'fitness'].map((category_id) => ({ category_id }));
    case 'notifications': return F.notifications;
    case 'user_blocks': return [];
    case 'post_saves': return [{ post_id: 'p1' }];
    case 'groups': {
      if (id) return F.groups.filter((g) => g.id === id);
      return F.groups.filter((g) => g.visibility === 'public');
    }
    case 'group_members': {
      if (sel.includes('groups(')) return F.myGroupIds.map((gid) => ({ groups: F.groups.find((g) => g.id === gid) }));
      const gid = eqParam(params, 'group_id');
      if (eqParam(params, 'user_id')) {
        if (!F.myGroupIds.includes(gid)) return [];
        const g = F.groups.find((x) => x.id === gid);
        return [{ role: g.owner_id === F.ME ? 'owner' : 'member', status: 'active' }];
      }
      const ids = gid === 'g1' ? [F.ME, 'u2', 'u3', 'u4', 'u5'] : ['u3', 'u6', F.ME];
      const g = F.groups.find((x) => x.id === gid);
      return ids.map((uid) => ({ user_id: uid, role: g && g.owner_id === uid ? 'owner' : 'member', status: 'active', profiles: { username: F.people[uid].username, display_name: F.people[uid].display_name, avatar_url: null } }));
    }
    case 'posts': {
      if (id) return F.posts.filter((p) => p.id === id);
      const author = eqParam(params, 'author_id');
      if (author) return F.posts.filter((p) => p.author_id === author);
      return F.posts;
    }
    case 'comments': return [];
    case 'conversations': return [{ id: 'cv1', kind: 'direct', group_id: null, user_a: F.ME, user_b: 'u2', groups: null }];
    case 'messages':
      if (method === 'POST') return [{ id: 'm-new', conversation_id: body.conversation_id, sender_id: body.sender_id, body: body.body, created_at: new Date().toISOString() }];
      return F.messages;
    case 'xp_transactions': return [
      { id: 'x1', source_type: 'goal_completion', amount: 20, created_at: F.iso(-2 * F.hour) },
      { id: 'x2', source_type: 'challenge_checkin', amount: 25, created_at: F.iso(-5 * F.hour) },
      { id: 'x3', source_type: 'post_helpful', amount: 15, created_at: F.iso(-F.day) },
      { id: 'x4', source_type: 'goal_completion', amount: 20, created_at: F.iso(-F.day - 3 * F.hour) },
      { id: 'x5', source_type: 'lesson_complete', amount: 30, created_at: F.iso(-2 * F.day) },
    ];
    case 'teacher_profiles': return [];
    case 'course_lessons': return [];
    case 'lesson_completions': return [];
    case 'course_reviews': return [];
    case 'post_helpful': return [{ post_id: 'p1' }];
    default: return [];
  }
}

function rpc(fn, args) {
  switch (fn) {
    case 'challenge_board': return args.p_challenge === 'c2' ? F.board : F.board.map((r) => ({ ...r, distance_m: 0, minutes: r.days * 47 }));
    case 'start_activity': return { id: 'a9', started_at: new Date().toISOString() };
    case 'start_goal_activity': return { id: 'a7', started_at: new Date().toISOString(), kind: 'focus' };
    case 'profile_stats':
      if (args.p_user === F.ME) return { posts: 12, followers: 24, following: 31, groups: 3, verified: true, i_follow: false, blocked: false, viewer_admin: true, banned: false, is_admin: true, goals_done: 64, checkins: 11, challenges_done: 1, helpful_received: 18, lessons_done: 4, liked: 842 > 0 ? 42 : 0, saved: 7 };
      return { posts: 48, followers: 12500, following: 180, groups: 6, verified: args.p_user === 'u3', i_follow: false, blocked: false, viewer_admin: true, banned: false };
    case 'unread_chat_count': return 7;
    case 'suggested_groups': return ['g4', 'g5', 'g6', 'g7'].map((gid) => { const g = F.groups.find((x) => x.id === gid); return { id: g.id, name: g.name, description: g.description, kind: g.kind, category_id: g.category_id, join_policy: g.join_policy, members: F.groupStats[gid].members }; });
    case 'group_stats': return (args.p_ids || []).filter((x) => F.groupStats[x]).map((x) => ({ group_id: x, members: F.groupStats[x].members, preview: F.groupStats[x].preview }));
    case 'search_people': return args.p_query ? F.searchPeople.filter((p) => p.display_name.includes(args.p_query) || p.username.includes(args.p_query)) : F.searchPeople;
    case 'my_conversations': return F.conversations;
    case 'mark_conversation_read': return null;
    case 'is_admin': return true;
    case 'follow_list': return F.searchPeople.map((p) => ({ ...p, followed_at: F.iso(-F.day) }));
    case 'admin_overview': return { open_reports: 3, users: 1284, new_users_7d: 96, banned: 2, groups: 143, posts_7d: 512, messages_7d: 4310, pending_teachers: 2 };
    case 'admin_reports': return [
      { id: 'r1', target_type: 'post', target_id: 'p9', reason: 'Спам, сурталчилгаа', status: 'open', created_at: F.iso(-40 * 60000), reporter_name: 'Сараа', reports_on_target: 3, target_title: 'Mongol Tech Community', target_body: '🔥 Хурдан баяжих арга! Энэ линк дээр дараад 1 сая төгрөг ав...', target_owner: 'u9', target_owner_name: 'Spam Bot', target_hidden: false, owner_banned: false },
      { id: 'r2', target_type: 'message', target_id: 'm99', reason: 'Доромжилсон үг', status: 'open', created_at: F.iso(-3 * F.hour), reporter_name: 'Болд', reports_on_target: 1, target_title: null, target_body: 'Чи ямар тэнэг юм бэ...', target_owner: 'u8', target_owner_name: 'Хэрэглэгч 88', target_hidden: false, owner_banned: false },
      { id: 'r3', target_type: 'profile', target_id: 'u7', reason: 'Хуурамч профайл', status: 'open', created_at: F.iso(-F.day), reporter_name: 'Тэмүүжин', reports_on_target: 2, target_title: 'Elon Musk', target_body: '@elon_real_mn · Бизнесийн зөвлөгөө өгнө', target_owner: 'u7', target_owner_name: 'Elon Musk', target_hidden: false, owner_banned: false },
    ];
    case 'admin_teachers': return [
      { user_id: 'u3', display_name: 'Мөнхсайхан', username: 'munkhsaikhan', avatar_url: null, headline: 'IELTS 8.0 · 6 жил заасан туршлагатай', subjects: ['Англи хэл', 'IELTS'], intro: 'Сайн байна уу! Би IELTS-ийн бэлтгэлийг 6 жил заасан. Speaking, Writing дээр төвлөрдөг.', verified_at: null, courses: 2, rating_avg: 4.8, rating_count: 37, created_at: F.iso(-2 * F.day) },
      { user_id: 'u2', display_name: 'Тэмүүжин', username: 'temuujin', avatar_url: null, headline: 'React Native хөгжүүлэгч', subjects: ['Програмчлал'], intro: 'Mobile app хийх анхан шатны курс.', verified_at: null, courses: 1, rating_avg: null, rating_count: 0, created_at: F.iso(-5 * F.day) },
    ];
    case 'teacher_stats': return null;
    default: return null;
  }
}

async function route(page) {
  await page.route(/supabase\.co\//, async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const method = req.method();
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': 'Content-Range' };
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers });
    if (url.pathname.startsWith('/auth/v1/user')) return r.fulfill({ status: 200, headers, body: JSON.stringify(USER) });
    if (url.pathname.startsWith('/auth/v1/token')) return r.fulfill({ status: 200, headers, body: JSON.stringify(SESSION) });
    if (url.pathname.startsWith('/auth/v1/')) return r.fulfill({ status: 200, headers, body: '{}' });
    if (url.pathname.startsWith('/storage/v1/object/sign/') && method === 'POST') {
      let b = {};
      try { b = req.postDataJSON() || {}; } catch {}
      const bucket = url.pathname.split('/')[5];
      return r.fulfill({ status: 200, headers, body: JSON.stringify((b.paths || []).map((p) => ({ path: p, signedURL: `/object/sign/${bucket}/${p}?token=x`, error: null }))) });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      return r.fulfill({ status: 200, headers: { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(path.join(__dirname, 'photo.jpg')) });
    }
    let body = {};
    try { body = req.postDataJSON() || {}; } catch { body = {}; }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      return r.fulfill({ status: 200, headers, body: JSON.stringify(rpc(fn, body)) });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').pop();
      const rows = respond(table, url.searchParams, method, body);
      const accept = req.headers()['accept'] || '';
      if (method === 'HEAD' || (req.headers()['prefer'] || '').includes('count=')) {
        const n = table === 'notifications' ? 3 : rows.length;
        headers['Content-Range'] = `0-${Math.max(0, n - 1)}/${n}`;
        if (method === 'HEAD') return r.fulfill({ status: 200, headers, body: '' });
      }
      if (method === 'PATCH' || method === 'DELETE') return r.fulfill({ status: 204, headers, body: '' });
      if (accept.includes('vnd.pgrst.object')) return r.fulfill({ status: rows[0] ? 200 : 406, headers, body: JSON.stringify(rows[0] ?? { code: 'PGRST116', message: 'no rows' }) });
      return r.fulfill({ status: method === 'POST' ? 201 : 200, headers, body: JSON.stringify(rows) });
    }
    return r.fulfill({ status: 200, headers, body: '{}' });
  });
}

const SCREENS = [
  { name: '01-welcome', url: '/', auth: false },
  { name: '02-register', url: '/register', auth: false },
  { name: '03-login', url: '/login', auth: false },
  { name: '10-home', url: '/home', scroll: true },
  { name: '11-groups', url: '/groups', scroll: true },
  { name: '12-notifications', url: '/notifications' },
  { name: '13-profile', url: '/profile', scroll: true },
  { name: '14-create-sheet', url: '/home', plus: true },
  { name: '20-group-detail', url: '/group/g1', scroll: true },
  { name: '21-group-posts', url: '/group/g1', tab: 'Пост' },
  { name: '22-group-new', url: '/group/new', scroll: true },
  { name: '23-feed', url: '/feed/g1' },
  { name: '30-search', url: '/search' },
  { name: '31-user', url: '/user/u2', scroll: true },
  { name: '32-follows', url: '/follows/u-me?kind=followers' },
  { name: '40-chats', url: '/chats' },
  { name: '41-chat', url: '/chat/cv1' },
  { name: '42-chat-attach', url: '/chat/cv1', click: 'Хавсаргах' },
  { name: '24-group-more', url: '/group/g1', click: 'Бусад' },
  { name: '50-admin', url: '/admin', scroll: true },
  { name: '51-achievements', url: '/me/achievements' },
  { name: '52-xp', url: '/me/xp' },
  { name: '53-settings', url: '/settings' },
  { name: '54-goal-new', url: '/goal/new' },
  { name: '55-interests', url: '/interests?edit=1' },
  { name: '56-challenge-new', url: '/challenge/new?groupId=g2', clickText: 'Гүйлт', scroll: true },
  { name: '57-challenge-new-place', url: '/challenge/new?groupId=g2', clickText: 'Байршил' },
  { name: '58-challenge-run', url: '/challenge/c2', scroll: true },
  { name: '59-track-ready', url: '/track/c2', scroll: true },
  { name: '60-track-running', url: '/track/c2', seed: 'run', scroll: true },
  { name: '61-track-place', url: '/track/c3', seed: 'place' },
  { name: '62-track-focus', url: '/track/c4', clickText: 'Эхлэх' },
  { name: '63-track-goal', url: '/track/go3?type=goal', scroll: true },
  { name: '64-goal-new-run', url: '/goal/new', clickText: '🏃 5 км гүйх' },
  { name: '65-home-goal-confirm', url: '/home', clickText: '20 шинэ англи үг цээжлэх' },
];

// Хянагчийн "явагдаж буй" төлөвийг харуулахын тулд AsyncStorage (вэб дээр localStorage)-д бүртгэл суулгана.
function seedTracking({ kind, place }) {
  const now = Date.now();
  const pts = [];
  if (kind === 'run') {
    const start = now - 18 * 60000;
    const lat0 = 47.9205, lng0 = 106.9125, R = 450;
    for (let i = 0; i <= 216; i++) {
      const th = (i / 216) * 1.65 * Math.PI;
      const r = R + 40 * Math.sin(th * 3);
      pts.push({ lat: lat0 + (r * Math.sin(th)) / 111320, lng: lng0 + (r * Math.cos(th)) / (111320 * Math.cos((lat0 * Math.PI) / 180)), t: start + i * 5000, acc: 6 });
    }
    localStorage.setItem('together:track:session', JSON.stringify({ activityId: 'a9', challengeId: 'c2', kind: 'run', startedAt: new Date(start).toISOString(), background: true, offsetMs: 0 }));
  } else {
    const start = now - 32 * 60000;
    for (let i = 0; i <= 32; i++) {
      const a = i * 1.7, d = 15 + 20 * Math.abs(Math.sin(i));
      pts.push({ lat: place.lat + (d * Math.sin(a)) / 111320, lng: place.lng + (d * Math.cos(a)) / (111320 * 0.67), t: start + i * 60000, acc: 12 });
    }
    localStorage.setItem('together:track:session', JSON.stringify({ activityId: 'a8', challengeId: 'c3', kind: 'place', startedAt: new Date(start).toISOString(), background: true, offsetMs: 0 }));
  }
  localStorage.setItem('together:track:points', JSON.stringify(pts));
}

(async () => {
  await new Promise((ok) => server.listen(8099, ok));
  const browser = await chromium.launch();
  const logs = [];
  for (const s of SCREENS) {
    if (ONLY.length && !ONLY.some((o) => s.name.includes(o))) continue;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'mn-MN', timezoneId: 'Asia/Ulaanbaatar' });
    if (s.auth !== false) {
      await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-ttkvvclhtcngushymdkc-auth-token', JSON.stringify(SESSION)]);
    }
    if (s.seed) await ctx.addInitScript(seedTracking, { kind: s.seed, place: F.PLACE });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') logs.push(`[${s.name}] ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (e) => logs.push(`[${s.name}] PAGEERROR ${String(e).slice(0, 300)}`));
    await route(page);
    await page.goto(`http://localhost:8099${s.url}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    if (s.tab) { await page.getByText(s.tab, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(1500); }
    if (s.click) { await page.getByLabel(s.click).first().click().catch(() => {}); await page.waitForTimeout(1200); }
    if (s.clickText) { await page.getByText(s.clickText, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(1800); }
    if (s.plus) { await page.getByLabel('Үүсгэх').first().click().catch(() => {}); await page.waitForTimeout(1200); }
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    if (s.scroll) {
      // Хамгийн том гүйлгэгддэг элементийг доош гүйлгэж хоёр дахь зураг.
      for (const [i, label] of [[1, 'mid'], [2, 'end']]) {
        await page.mouse.move(195, 500);
        await page.mouse.wheel(0, i === 1 ? 650 : 5000);
        await page.waitForTimeout(1300);
        await page.screenshot({ path: path.join(OUT, `${s.name}-${label}.png`) });
      }
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'console.log'), logs.join('\n'));
  console.log('done', logs.length, 'console errors');
})();
