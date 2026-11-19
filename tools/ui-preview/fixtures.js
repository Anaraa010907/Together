// Жишээ өгөгдөл — бодит Supabase руу хүсэлт явахгүй, Playwright бүгдийг энд хариулна.
const now = Date.now();
const iso = (msOffset) => new Date(now + msOffset).toISOString();
const day = 86400000, hour = 3600000;
const pad = (n) => String(n).padStart(2, '0');
const dateOnly = (offsetDays) => { const d = new Date(now + offsetDays * day); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const ME = 'u-me';
const people = {
  [ME]: { id: ME, username: 'anaraa', display_name: 'Анараа', bio: 'Өдөр бүр 1%-иар илүү 🚀 Англи хэл, код, гүйлт.', locale: 'mn', avatar_url: null, interests_set_at: iso(-20 * day), banned_at: null },
  u2: { id: 'u2', username: 'temuujin', display_name: 'Тэмүүжин', bio: 'Frontend хөгжүүлэгч. React Native 💙', locale: 'mn', avatar_url: null },
  u3: { id: 'u3', username: 'munkhsaikhan', display_name: 'Мөнхсайхан', bio: 'IELTS 8.0 · Англи хэлний багш', locale: 'mn', avatar_url: null },
  u4: { id: 'u4', username: 'bytezaya', display_name: 'Заяа', bio: 'Data analyst', locale: 'mn', avatar_url: null },
  u5: { id: 'u5', username: 'bold.run', display_name: 'Болд', bio: 'Марафон 🏃', locale: 'mn', avatar_url: null },
  u6: { id: 'u6', username: 'saraa', display_name: 'Сараа', bio: '', locale: 'mn', avatar_url: null },
};
const pv = (id) => ({ name: people[id].display_name, url: null });

const categories = [
  ['language', 'Гадаад хэл', 'Languages', '🗣️'], ['programming', 'Програмчлал', 'Programming', '💻'],
  ['business', 'Бизнес, стартап', 'Business', '📈'], ['study', 'Хичээл, шалгалт', 'Study & exams', '📚'],
  ['fitness', 'Фитнес, спорт', 'Fitness & sport', '🏃'], ['health', 'Эрүүл амьдрал', 'Healthy living', '🥗'],
  ['reading', 'Ном унших', 'Reading', '📖'], ['mindfulness', 'Сэтгэл амар байдал', 'Mindfulness', '🧘'],
  ['career', 'Ажил мэргэжил', 'Career', '💼'], ['finance', 'Санхүүгийн боловсрол', 'Personal finance', '💰'],
  ['art', 'Урлаг, дизайн', 'Art & design', '🎨'], ['music', 'Хөгжим', 'Music', '🎵'],
].map(([id, name_mn, name_en, icon], i) => ({ id, name_mn, name_en, icon, position: i + 1 }));

const G = (id, name, description, category_id, extra = {}) => ({
  id, name, slug: id, description, visibility: 'public', join_policy: 'open', owner_id: 'u2', kind: 'community',
  category_id, cover_url: null, ...extra,
});
const groups = [
  G('g1', 'Програмчлалын клуб', 'Програмчлал, технологийн талаар хамтдаа суралцаж, хөгжих клуб. Долоо хоног бүр code review, сар бүр hackathon зохион байгуулдаг. 🚀', 'programming', { owner_id: ME }),
  G('g2', 'IELTS 7+ бэлтгэл', 'Өдөр бүр 20 шинэ үг, долоо хоногт 2 speaking дасгал.', 'language', { owner_id: 'u3', kind: 'course' }),
  G('g3', 'Өглөөний гүйлт', 'Өглөө 6:30-д Туул голын эрэг дагуу.', 'fitness', { owner_id: 'u5' }),
  G('g4', 'Mongol Tech Community', 'Монголын технологийн салбарын хамгийн том нийгэмлэг.', 'programming', { owner_id: 'u4' }),
  G('g5', 'Бизнесийн хөгжлийн клуб', 'Стартап санаа, pitch, санхүүжилт.', 'business', { owner_id: 'u2', join_policy: 'approval' }),
  G('g6', 'Сар бүр 2 ном', 'Ном уншиж, хэлэлцэх клуб.', 'reading', { owner_id: 'u6' }),
  G('g7', 'Санхүүгийн боловсрол 101', 'Төсөв, хуримтлал, хөрөнгө оруулалт.', 'finance', { owner_id: 'u4' }),
];
const myGroupIds = ['g1', 'g2', 'g3'];
const groupStats = {
  g1: { members: 2843, preview: [pv('u2'), pv('u3'), pv('u4')] },
  g2: { members: 1520, preview: [pv('u3'), pv('u6'), pv(ME)] },
  g3: { members: 86, preview: [pv('u5'), pv(ME)] },
  g4: { members: 12500, preview: [pv('u4'), pv('u2'), pv('u6')] },
  g5: { members: 1530, preview: [pv('u2'), pv('u5')] },
  g6: { members: 342, preview: [pv('u6'), pv('u3')] },
  g7: { members: 958, preview: [pv('u4')] },
};

const goals = [
  { id: 'go1', title: '💧 2 л ус уух', frequency: 'daily', target: 1, status: 'active', verification: 'manual', activity: null, min_distance_m: null, min_minutes: null },
  { id: 'go2', title: '20 шинэ англи үг цээжлэх', frequency: 'daily', target: 1, status: 'active', verification: 'manual', activity: null, min_distance_m: null, min_minutes: null },
  { id: 'go3', title: '🏃 5 км гүйх', frequency: 'daily', target: 1, status: 'active', verification: 'gps', activity: 'run', min_distance_m: 5000, min_minutes: null },
  { id: 'go4', title: '📚 30 мин ном унших', frequency: 'daily', target: 1, status: 'active', verification: 'focus', activity: null, min_distance_m: null, min_minutes: 30 },
];
const doneGoals = ['go1'];
const challenge = { id: 'c1', group_id: 'g2', creator_id: 'u3', title: '30 хоног — өдөрт 20 англи үг', description: 'Өдөр бүр check-in хийнэ.', start_on: dateOnly(-11), end_on: dateOnly(18), verification: 'manual' };
// Утсаар баталгаажих challenge-үүд (GPS гүйлт, байршил, фокус).
const PLACE = { lat: 47.9185, lng: 106.9177 };
const verifiedChallenges = [
  { id: 'c2', group_id: 'g2', creator_id: 'u3', title: 'Өглөөний гүйлт — өдөрт 3 км', description: 'Утасны GPS-ээр баталгаажна. Машинаар явбал тооцогдохгүй 😉', start_on: dateOnly(-5), end_on: dateOnly(24), verification: 'gps', activity: 'run', min_distance_m: 3000, min_minutes: null, place_name: null, place_lat: null, place_lng: null, place_radius_m: null },
  { id: 'c3', group_id: 'g2', creator_id: ME, title: 'Заалны 30 хоног', description: null, start_on: dateOnly(-3), end_on: dateOnly(26), verification: 'place', activity: null, min_distance_m: null, min_minutes: 45, place_name: 'Фитнес заал', place_lat: PLACE.lat, place_lng: PLACE.lng, place_radius_m: 100 },
  { id: 'c4', group_id: 'g2', creator_id: 'u2', title: 'Өдөрт 25 минут гүн фокус', description: null, start_on: dateOnly(-2), end_on: dateOnly(12), verification: 'focus', activity: null, min_distance_m: null, min_minutes: 25, place_name: null, place_lat: null, place_lng: null, place_radius_m: null },
];
const activities = [
  { id: 'a1', kind: 'run', status: 'verified', started_at: iso(-1 * day), distance_m: 3420, duration_s: 1188, avg_speed_mps: 2.88, reject_reason: null, checked_in: true },
  { id: 'a2', kind: 'run', status: 'rejected', started_at: iso(-2 * day), distance_m: 9120, duration_s: 640, avg_speed_mps: 14.2, reject_reason: 'too_fast', checked_in: false },
  { id: 'a3', kind: 'run', status: 'verified', started_at: iso(-3 * day), distance_m: 2150, duration_s: 760, avg_speed_mps: 2.83, reject_reason: null, checked_in: false },
];
const board = [
  { user_id: 'u3', display_name: 'Мөнхсайхан', avatar_url: null, days: 5, distance_m: 18400, minutes: 0 },
  { user_id: ME, display_name: 'Анараа', avatar_url: null, days: 3, distance_m: 9630, minutes: 0 },
  { user_id: 'u2', display_name: 'Тэмүүжин', avatar_url: null, days: 2, distance_m: 7010, minutes: 0 },
  { user_id: 'u4', display_name: 'Сараа', avatar_url: null, days: 1, distance_m: 3100, minutes: 0 },
];
const session = { id: 's1', group_id: 'g1', host_id: 'u2', title: 'React Native code review', description: 'Долоо хоногийн code review', starts_at: iso(day + 3 * hour), duration_min: 60, meeting_url: 'https://meet.google.com/abc', notes: null, cancelled_at: null, profiles: { display_name: 'Тэмүүжин' } };

const notifications = [
  { id: 'n1', type: 'follow', actor_id: 'u3', group_id: null, entity_id: null, data: {}, read_at: null, created_at: iso(-12 * 60000), profiles: { display_name: 'Мөнхсайхан', avatar_url: null } },
  { id: 'n2', type: 'comment', actor_id: 'u2', group_id: 'g1', entity_id: 'p1', data: { text: 'Маш хэрэгтэй зөвлөгөө байна, баярлалаа!' }, read_at: null, created_at: iso(-1 * hour), profiles: { display_name: 'Тэмүүжин', avatar_url: null } },
  { id: 'n3', type: 'helpful', actor_id: 'u4', group_id: 'g1', entity_id: 'p1', data: {}, read_at: null, created_at: iso(-3 * hour), profiles: { display_name: 'Заяа', avatar_url: null } },
  { id: 'n4', type: 'session', actor_id: 'u2', group_id: 'g1', entity_id: 's1', data: { title: 'React Native code review', group: 'Програмчлалын клуб' }, read_at: iso(-hour), created_at: iso(-day), profiles: { display_name: 'Тэмүүжин', avatar_url: null } },
  { id: 'n5', type: 'join_approved', actor_id: 'u3', group_id: 'g2', entity_id: null, data: { group: 'IELTS 7+ бэлтгэл' }, read_at: iso(-day), created_at: iso(-2 * day), profiles: { display_name: 'Мөнхсайхан', avatar_url: null } },
];

const P = (id, author, kind, body, minsAgo, extra = {}) => ({
  id, group_id: 'g1', author_id: author, kind, body, link_url: null, vote_deadline: null, created_at: iso(-minsAgo * 60000),
  profiles: { display_name: people[author].display_name, avatar_url: null }, post_attachments: [], comments: [{ count: extra.comments ?? 0 }],
  post_helpful: (extra.helpful ?? []).map((user_id) => ({ user_id })), proposal_votes: [],
});
const posts = [
  P('p1', 'u2', 'share', 'Энэ долоо хоногт Expo Router-ийн typed routes-ийг туршлаа. Навигацийн алдаа бараг 0 болсон 🎉 Хэрэгтэй хүмүүст жишээ кодоо хуваалцъя.', 45, { comments: 6, helpful: ['u3', 'u4', ME] }),
  P('p2', 'u4', 'question', 'Supabase RLS policy-г хэрхэн тест хийдэг вэ? pgTAP хэрэглэж байгаа хүн байна уу?', 180, { comments: 3, helpful: ['u2'] }),
  P('p3', ME, 'proposal', 'Дараагийн hackathon-ыг 12-р сарын 14-нд хийх үү? Сэдэв: "AI for Mongolia".', 1440, { comments: 9, helpful: ['u2', 'u5'] }),
];

const conversations = [
  { id: 'cv1', kind: 'direct', group_id: null, title: 'Тэмүүжин', avatar_url: null, other_id: 'u2', last_body: 'Маргааш code review-д ирэх үү?', last_sender_id: 'u2', last_at: iso(-8 * 60000), unread: 2 },
  { id: 'cv2', kind: 'group', group_id: 'g1', title: 'Програмчлалын клуб', avatar_url: null, other_id: null, last_body: 'Hackathon-ы бүртгэл нээгдлээ 🔥', last_sender_id: 'u4', last_at: iso(-50 * 60000), unread: 5 },
  { id: 'cv3', kind: 'direct', group_id: null, title: 'Мөнхсайхан', avatar_url: null, other_id: 'u3', last_body: 'Баярлалаа! Speaking дасгалаа явуулъя', last_sender_id: ME, last_at: iso(-5 * hour), unread: 0 },
  { id: 'cv4', kind: 'group', group_id: 'g3', title: 'Өглөөний гүйлт', avatar_url: null, other_id: null, last_body: 'Маргааш 6:30-д уулзъя', last_sender_id: 'u5', last_at: iso(-2 * day), unread: 0 },
];
const M = (id, sender, body, minsAgo) => ({ id, conversation_id: 'cv1', sender_id: sender, body, created_at: iso(-minsAgo * 60000), profiles: { display_name: people[sender].display_name, avatar_url: null } });
const MM = (id, sender, kind, minsAgo, extra) => ({ ...M(id, sender, '', minsAgo), kind, media_path: `cv1/${sender}/${id}`, media_mime: kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'audio/mp4', ...extra });
const messages = [
  MM('m12', ME, 'audio', 2, { media_duration_ms: 14000 }),
  MM('m11', 'u2', 'image', 4, { media_width: 1080, media_height: 1350 }),
  MM('m10', 'u2', 'video', 6, { media_duration_ms: 23000, media_width: 1920, media_height: 1080 }),
  M('m9', 'u2', 'Маргааш code review-д ирэх үү?', 8),
  M('m8', 'u2', 'Би PR-аа бэлдчихсэн байгаа', 9),
  M('m7', ME, 'Сайн байна, чи? Тэгэлгүй яах вэ 😄', 30),
  M('m6', ME, 'Өнөөдөр 2 цаг код бичлээ, streak 5 хоног боллоо!', 31),
  M('m5', 'u2', 'Сайн уу! Ажил чинь ямар байна?', 62),
  M('m4', ME, 'Юу ч гэсэн хамтдаа сайжруулъя 🙌', 1500),
  M('m3', 'u2', 'Чиний санал болгосон ном үнэхээр гоё байлаа', 1510),
];

const searchPeople = [
  { id: 'u3', username: 'munkhsaikhan', display_name: 'Мөнхсайхан', avatar_url: null, followers: 8700, i_follow: true, verified: true },
  { id: 'u2', username: 'temuujin', display_name: 'Тэмүүжин', avatar_url: null, followers: 12500, i_follow: false, verified: false },
  { id: 'u4', username: 'bytezaya', display_name: 'Заяа', avatar_url: null, followers: 6200, i_follow: false, verified: false },
  { id: 'u5', username: 'bold.run', display_name: 'Болд', avatar_url: null, followers: 1240, i_follow: false, verified: false },
  { id: 'u6', username: 'saraa', display_name: 'Сараа', avatar_url: null, followers: 310, i_follow: true, verified: false },
];

module.exports = { ME, people, categories, groups, myGroupIds, groupStats, goals, doneGoals, challenge, verifiedChallenges, activities, board, PLACE, session, notifications, posts, conversations, messages, searchPeople, iso, day, hour, dateOnly };
