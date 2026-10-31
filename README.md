# TOGETHER

Хүмүүс зорилгоо нэгтгэж, хамтдаа хөгжихөд зориулсан Social Growth Platform.
Growth-first: зорилго, дадал, Challenge, ахиц дэвшил. Монгол + Англи хэл.

## Бүтэц

```
apps/mobile     React Native + Expo + TypeScript (Expo Router)
apps/admin      Next.js admin dashboard (хийгдээгүй)
packages/ui     Design tokens, дахин ашиглах компонент
packages/types  Supabase-ээс үүссэн төрлүүд (хийгдээгүй)
packages/utils  Нийтлэг функцүүд
supabase/       migrations, edge functions, seed
docs/           Төлөвлөгөөний засвар, шийдвэрүүд (decisions.md)
tests/          E2E тестүүд (хийгдээгүй)
```

## Эхлүүлэх

1. Node 20+ суулгана.
2. `npm install` (root-оос; workspaces ашиглана).
3. `apps/mobile/.env.example`-ийг `apps/mobile/.env` болгож Supabase-ийн утгуудаа бөглөнө.
4. Supabase CLI-аар локал стек асаана: `supabase start`, дараа нь `supabase db reset` (migrations ажиллана).
5. `npm run mobile` — Expo dev server.

### DB тест (Supabase шаардахгүй)

Локал PostgreSQL дээр migration бүрийг дараалан ажиллуулж, RLS, баганын эрх, функцийн дүрмийг шалгана:

```bash
PGHOST=/tmp PGPORT=5432 PGUSER=postgres tests/db/run.sh
```

`tests/db/00_supabase_shim.sql` нь Supabase-ийн `auth` схем, роль, default grant-ийг дуурайна.

> Анхаар: Mobile app-ийг (`npm install`, typecheck, төхөөрөмж дээрх ажиллагаа) бүрэн шалгаагүй байна. Эхний ажил нь `npx expo install --fix`-ээр хувилбаруудыг SDK-тай зөрчилгүй болгох.

## Баримт

- `docs/decisions.md` — төлөвлөгөөнд хийсэн засвар, MVP хязгаар, шийдвэрүүд.
- Эхний sprint: Foundation (project setup, design tokens, schema + RLS, auth, i18n).

## Онцгой дүрэм

- XP, Rank, төлбөр, эрхийн шалгалтыг **сервер талд** (RLS, security definer функц, Edge Function) баталгаажуулна. Client-д итгэхгүй.
- Android APK-г зөвхөн хэрэглэгч шууд хүсэх үед бүтээнэ.

## Codespace

Repo-д `.devcontainer/` байгаа тул GitHub Codespace нээхэд Node 20, Docker бэлэн болно. Codespace-д:

1. `npm install` автоматаар ажиллана (postCreate).
2. `npx supabase start` — локал Supabase стек (Docker).
3. `supabase/migrations`-ийг `npx supabase db reset`-ээр ажиллуулна.
4. `npm run mobile` → Expo tunnel, QR-ийг Expo Go-оор уншуулна.
