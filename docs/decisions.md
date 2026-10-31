# TOGETHER — төлөвлөгөөний засвар ба шийдвэр

Эх баримт: `TOGETHER_Development_Plan.docx` (v1). Доорх нь түүний сул талууд, засвар, MVP хязгаар.

## 1. Хамрах хүрээ (scope) хэт том

Plan-ийн 12–14 долоо хоног нь нэг туршлагатай хөгжүүлэгчид хэт оновчтой. Chat (realtime), Rank, Leaderboard, Admin, Subscription, Moderation бүгд нэг дор байна.

**MVP (анхны release):**
- Auth (имэйл + Google/Apple), onboarding, профайл
- Group үүсгэх, нийтийн/хаалттай, join policy (open / approval)
- Зорилго (goal) + өдөр тутмын биелэлт
- XP, Level, streak (Rank-гүй)
- Энгийн report + block

**MVP-ээс хойш:** Challenge, Feed/comments, Chat, Rank/leaderboard, Achievements, Admin dashboard, Subscription.

Санал: Chat-ыг хамгийн сүүлд, Rank-ыг улирлын системтэй хамт хийх.

## 2. Нийцэл ба хууль (plan-д байхгүй, заавал хэрэгтэй)

- **Насанд хүрээгүй хэрэглэгч.** Бүх насны платформ тул `profiles.is_minor` flag, parental consent урсгал, minor-ийн профайлыг private байлгах, DM-ийг хязгаарлах шаардлагатай. Exact `birth_date`-ийг хадгалахгүй — хэрэгцээгүй өгөгдөл хадгалах нь эрсдэл. Зөвхөн `is_minor` (эсвэл насны бүлэг).
- **UGC дүрэм.** App Store болон Google Play нь user-generated content-д report, block, filter, moderation заавал байхыг шаарддаг. Plan-д block/report байгаа ч moderation queue, хугацаа (SLA), хориглосон контентын жагсаалт алга.
- **Account deletion.** Хоёр дэлгүүр хоёулаа in-app account устгах боломж шаарддаг. Plan-д байхгүй.
- **Terms of Service, Privacy Policy.** Монгол + Англи хоёр хэлээр, аппын дотор харагдах ёстой.
- **Төлбөр.** Дижитал давуу эрх (premium) бол Apple/Google-ийн in-app purchase дүрэм хамаарна. QPay/SocialPay-г аппын дотор дижитал эрх зарахад ашиглах боломжгүй. Plan-ийн `payments` хүснэгтийг IAP-ийн receipt-тай (RevenueCat гэх мэт) холбоно.
- **Нэрийн давхардал.** "Together" нэр нь дэлгүүрт маш олон app-д байгаа. Store-д бүртгэхээсээ өмнө нэр, trademark-ийг шалгах.
- **Monetization-ын хууль.** Монголын хувийн мэдээллийн хамгаалалтын холбогдох хуулийг хуульчтай хамт шалгах.

## 3. Өгөгдлийн сангийн засвар

| Асуудал | Засвар |
| --- | --- |
| `group_members` тусдаа PK байхгүй | `primary key (group_id, user_id)` |
| `goal_completions.completed_at` нь timestamp тул өдөр бүр нэг удаа гэдгийг баталгаажуулах боломжгүй | `completed_on date` + `unique (goal_id, completed_on)`; өдрийг хэрэглэгчийн `timezone`-оор тооцно |
| XP давхар олголтын "idempotency" гэсэн зарчим байгаа ч unique key алга | `xp_transactions` дээр `unique (user_id, source_type, source_id)` |
| Client `xp_transactions`-д insert хийж болох эрсдэл | XP-ийн insert-ийг зөвхөн security definer функц / Edge Function-д хязгаарлах |
| `profiles` дээр client өөрийн `is_minor` / role-ыг өөрчилж болно | `grant update (…)` багана тус бүрээр нь өгөх |
| Group visibility policy-д `group_members` рекурс үүсэх эрсдэл | `is_group_member()` security definer функц ашиглах |
| `group_join_requests` болон `group_members.status` давхардсан | Нэг хүснэгт: `group_members.status` = active / pending / banned |
| Soft delete, `updated_at`-ийн стратеги байхгүй | `deleted_at` нэмсэн; `updated_at` trigger дараагийн алхамд |
| `birth_date` | Хадгалахгүй, `is_minor` болгосон |

Migration `supabase/migrations/0001_init.sql`-д эдгээрийг хэрэгжүүлсэн.

## 4. Дизайн ба UI

- **Контрастын асуудал.** Champagne Gold `#C6A66B` дээр Warm Ivory `#F4F0E7` (текст) нь ойролцоогоор **2:1** контраст өгнө — WCAG-ын доод шаардлагаас (4.5:1) хавьгүй доогуур. Тиймээс:
  - Алтан өнгийг **фон, progress, icon, accent**-д ашиглана; **текст нь Midnight Navy** дээр байна.
  - Gold дээрх текст = navy (`#111923`) ≈ 7.7:1.
  - Sage Green `#718A7A` дээр текст 3.3:1 тул жижиг текст navy дээр, sage нь зөвхөн fill.
- **Dark mode.** Settings-д `theme` байгаа ч token байхгүй. `packages/ui/src/tokens.ts`-д light/dark хоёуланг тодорхойлсон.
- **Гар утасны хэл.** Монгол кирилл дээр `Ө`, `Ү` тэмдэгтүүд фонтод байгааг шалгах (Manrope болон бусад Google Fonts-ийн Cyrillic subset-ийг шалгах).
- **NativeWind + custom components.** Хоёрыг зэрэг сонгох нь суралцах муруйг нэмдэг. Санал: нэгийг сонгох (NativeWind эсвэл StyleSheet + tokens).

## 5. Gamification

- "Group-д бодитой туслах +10", "Шинэ мэдлэг хуваалцах +15" нь spam-аар хуурах боломжтой. Хамаарах хэсгийг тодорхой шалгуур (хүлээн авагчийн баталгаа, moderation, өдрийн дээд хязгаар) дээр тулгуурлуулах.
- Улирлын Rank нь жижиг хэрэглэгчийн суурьтай үед демотивацитай. MVP-д Rank-ыг орхиж, зөвхөн хувийн ахиц + Group дотроох ахиц хийх санал.
- Streak-ийг хэрэглэгчийн `timezone`-оор тооцно (Улаанбаатар UTC+8).

## 6. Технологи

| Plan | Санал |
| --- | --- |
| Expo Router + NativeWind | NativeWind эсвэл StyleSheet — нэгийг нь сонгох |
| (i18n гэж заагаагүй) | `i18next` + `react-i18next` + `expo-localization`, default `mn` |
| Jest + RNTL + E2E | Jest + RNTL, E2E нь **Maestro** (Expo-д энгийн) |
| Crash мэдээлэл байхгүй | Sentry |
| Auth | Имэйл + Google/Apple; утасны дугаараар нэвтрэх нь Монголд түгээмэл тул дараа нэмэх боломж |
| Admin Next.js | MVP-ээс хойш; эхэндээ Supabase Studio + энгийн SQL view |

## 7. Хугацаа

12–14 долоо хоног нь **багийн** урьдчилсан тооцоо гэж plan өөрөө хэлсэн. Нэг хүний хувьд MVP нь ойролцоогоор хоёр дахин их хугацаа шаардана гэж үзэх нь бодитой. Sprint бүрийн төгсгөлд харагдах үр дүнтэй (demo-able) байх.

## 8. Нэмэлт шаардлага

- Rate limiting (Edge Function дээр) — report, friend request, message spam-аас хамгаална.
- Feature flags — beta-д дэлгэх.
- Backup, staging орчин (Supabase branch).
- Тохиргооны "Миний өгөгдлөө татах" (data export) — GDPR-тэй адил хандлага.

## Шийдвэр хүлээгдэж буй асуудал

1. MVP-ийн хязгаарыг (дээрх 1-р хэсэг) зөвшөөрөх үү?
2. Premium-ийг IAP-аар хийх үү, эсвэл MVP-д бүрэн үнэгүй байх уу?
3. ~~Нэвтрэх арга~~ → **Шийдсэн:** Google, Apple, утасны дугаараар нэвтрэх (Supabase Auth). Утасны OTP-ийн SMS provider-ийг Монголд сайн ажилладаг нэгийг сонгох шаардлагатай.
4. Хэл: Монгол default, Англи хоёр дахь — тийм үү?
