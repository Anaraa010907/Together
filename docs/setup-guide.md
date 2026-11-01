# TOGETHER — данс шаардлагатай тохиргоонууд

Эдгээрийг зөвхөн таны данс (Google, Apple, Expo, SMS үйлчилгээ) ашиглаж хийнэ. Код тал бэлэн, тохиргоо орсны дараа APK-г дахин бүтээхэд ажиллана.

Supabase project: `ttkvvclhtcngushymdkc` (Dashboard → https://supabase.com/dashboard/project/ttkvvclhtcngushymdkc)
Android package: `mn.together.app`, iOS bundle: `mn.together.app`

---

## 1. Имэйл баталгаажуулалт (одоо ажиллаж байгаа)

- Supabase-ийн үнэгүй имэйл зөвхөн project-ийн багийн гишүүдэд илгээдэг, цагт цөөн удаа.
- Бусдаар туршуулах: **Authentication → Sign In / Providers → Email → Confirm email**-ийг унтраана, эсвэл
- Жинхэнэ хэрэглээнд: **Authentication → Emails → SMTP Settings**-д өөрийн SMTP (Resend, SendGrid, Gmail Workspace гэх мэт) холбоно.

## 2. Google-ээр нэвтрэх

1. https://console.cloud.google.com → шинэ project → **APIs & Services → OAuth consent screen** бөглөнө.
2. **Credentials → Create credentials → OAuth client ID** гурвыг үүсгэнэ:
   - **Web application** (Supabase-д) — Authorized redirect URI: `https://ttkvvclhtcngushymdkc.supabase.co/auth/v1/callback`
   - **Android** — package `mn.together.app`, SHA-1 нь APK-г гарын үсэг зурсан түлхүүрийнх (одоогийн build Expo-ийн debug түлхүүрээр; Play Store-д гаргахдаа өөрийн түлхүүр үүсгэнэ).
   - **iOS** — bundle `mn.together.app`.
3. Supabase → **Authentication → Sign In / Providers → Google** → Enable, Web client ID + secret-ийг оруулна. "Authorized Client IDs"-д Android, iOS client ID-уудыг нэмнэ.
4. GitHub repo → **Settings → Secrets and variables → Actions → New secret**:
   `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`
5. APK дахин бүтээхэд Нэвтрэх дэлгэц дээр Google товч гарч ирнэ.

## 3. Apple-ээр нэвтрэх (зөвхөн iOS)

1. Apple Developer Program (жилд 99$) шаардлагатай.
2. **Certificates, IDs & Profiles → Identifiers** → `mn.together.app` дээр **Sign In with Apple** идэвхжүүлнэ.
3. **Keys** → Sign in with Apple түлхүүр үүсгэнэ (.p8).
4. Supabase → **Providers → Apple** → Enable, Client ID = `mn.together.app`, Team ID, Key ID, .p8 агуулгыг оруулна.
5. iOS build-д EAS (Expo) данс хэрэгтэй — Android APK-д хамаарахгүй.

## 4. Утасны дугаараар нэвтрэх (SMS)

1. Supabase → **Providers → Phone** → Enable.
2. SMS илгээгч сонгоно: Supabase-д бэлэн холбогддог олон улсын үйлчилгээ (Twilio, Vonage гэх мэт) — Монгол (+976) руу илгээх үнэ, хүргэлтийг тухайн үйлчилгээн дээр шалгана.
3. Монголын SMS үйлчилгээ ашиглах бол **Authentication → Hooks → Send SMS hook**-оор өөрийн Edge Function холбоно (SMS API-ийн түлхүүрийг Edge Function secret-д хадгална). Хүсвэл энэ функцийг бичиж өгнө.
4. Rate limit: **Authentication → Rate Limits**-д нэг дугаарт илгээх SMS-ийг хязгаарлана (spam, зардлаас хамгаална).

## 5. Push мэдэгдэл (утас унтраатай байхад)

Одоо апп доторх 🔔 мэдэгдэл ажиллаж байна. Утсанд push ирүүлэхэд:

1. https://expo.dev данс → `npx eas init` (Codespace дээр) → `app.json`-д `extra.eas.projectId` нэмэгдэнэ.
2. Android: Firebase project → Android app (`mn.together.app`) → `google-services.json` татаж `apps/mobile/`-д хийнэ, `app.json`-д `android.googleServicesFile`. Firebase-ийн FCM V1 service account-ийг `eas credentials`-ээр Expo-д оруулна.
3. Үүний дараа: төхөөрөмжийн push token хадгалах хүснэгт + `notifications` хүснэгтэд мөр нэмэгдэхэд Expo Push API руу илгээх Edge Function нэмнэ (бэлэн болмогц надад хэлбэл бичнэ).

## 6. Багш баталгаажуулах

Одоогоор SQL Editor-оос:

```sql
update teacher_profiles set verified_at = now()
where user_id = (select id from profiles where username = 'BAGSHIIN_USERNAME');
```

Шалгуур (иргэний үнэмлэх, туршлага, ярилцлага) болон апп доторх хүсэлтийн урсгалыг шийдэх шаардлагатай.

## 7. Дэлгүүрт гаргахаас өмнө

- Үйлчилгээний нөхцөл, Нууцлалын бодлого (апп дотор, төсөл) — хуульчаар хянуулж, холбоо барих имэйл нэмэх.
- Play Store: өөрийн upload түлхүүр, `versionCode` нэмэх, AAB build, Data safety маягт (цуглуулдаг өгөгдөл — Нууцлалын бодлоготой ижил).
- Хүүхэд хэрэглэгчтэй тул Play-ийн **Families / Target audience** хэсгийг үнэн зөв бөглөх.
